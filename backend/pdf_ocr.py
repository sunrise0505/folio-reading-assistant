import os
import shutil
import subprocess
from collections.abc import Callable, Iterator
from contextlib import closing, contextmanager
from io import BytesIO
from math import sqrt
from threading import Lock
from time import monotonic

MAX_DPI_SCALE = 300 / 72
MAX_IMAGE_PIXELS = 10_000_000
MAX_IMAGE_EDGE = 4500
PAGE_TIMEOUT_SECONDS = 25
DOCUMENT_TIMEOUT_SECONDS = 180

# PDFium calls must be serialized even when requests handle separate PDFs.
PDFIUM_LOCK = Lock()


class PdfOCRError(ValueError):
    pass


@contextmanager
def pdf_ocr(data: bytes) -> Iterator[Callable[[int], str]]:
    executable = shutil.which("tesseract")
    if not executable:
        raise PdfOCRError("扫描 PDF 需要本地 Tesseract。请按 README 安装后重试。")
    try:
        from pypdfium2 import PdfDocument, PdfiumError
    except ImportError as error:
        raise PdfOCRError("扫描 PDF 的渲染依赖缺失。请按 README 安装 Python 依赖后重试。") from error

    environment = {**os.environ, "OMP_THREAD_LIMIT": "1"}
    deadline = monotonic() + DOCUMENT_TIMEOUT_SECONDS
    with PDFIUM_LOCK:
        try:
            document = PdfDocument(data)
        except (PdfiumError, OSError) as error:
            raise PdfOCRError("无法为扫描 PDF 生成页图，请重新导出 PDF 后再试。") from error

    def recognize(index: int) -> str:
        if monotonic() >= deadline:
            raise PdfOCRError("扫描 PDF 识别耗时过长，请将文件拆成较短的 PDF 后重试。")
        try:
            with PDFIUM_LOCK, closing(document[index]) as page, BytesIO() as image:
                width, height = page.get_size()
                if width <= 0 or height <= 0:
                    raise ValueError("Invalid page dimensions")
                scale = min(MAX_DPI_SCALE, MAX_IMAGE_EDGE / max(width, height), sqrt(MAX_IMAGE_PIXELS / (width * height)))
                with closing(page.render(scale=scale, grayscale=True, rev_byteorder=False)) as bitmap:
                    bitmap.to_pil().save(image, format="PNG", dpi=(round(72 * scale), round(72 * scale)))
                rendered_png = image.getvalue()
        except ImportError as error:
            raise PdfOCRError("扫描 PDF 的图片依赖缺失。请按 README 安装 Python 依赖后重试。") from error
        except (PdfiumError, OSError, ValueError, OverflowError) as error:
            raise PdfOCRError(f"无法为 PDF 第 {index + 1} 页生成页图。") from error

        remaining = deadline - monotonic()
        if remaining <= 0:
            raise PdfOCRError("扫描 PDF 识别耗时过长，请将文件拆成较短的 PDF 后重试。")
        try:
            result = subprocess.run(
                [executable, "stdin", "stdout", "-l", "eng", "--psm", "3"],
                input=rendered_png, capture_output=True, env=environment,
                timeout=min(PAGE_TIMEOUT_SECONDS, remaining),
            )
        except subprocess.TimeoutExpired as error:
            raise PdfOCRError(f"PDF 第 {index + 1} 页识别超时，请尝试裁剪或上传更清晰的扫描件。") from error
        except OSError as error:
            raise PdfOCRError("无法运行本地 Tesseract，请检查安装和 PATH。") from error
        if result.returncode != 0:
            if b"eng.traineddata" in result.stderr:
                raise PdfOCRError("Tesseract 缺少英文识别数据 eng，请按 README 安装后重试。")
            raise PdfOCRError(f"无法识别 PDF 第 {index + 1} 页，请尝试上传更清晰的扫描件。")
        return result.stdout.decode("utf-8", errors="replace").strip()

    try:
        yield recognize
    finally:
        with PDFIUM_LOCK:
            document.close()
