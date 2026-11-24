import type { SlideItem } from '../types/studio';
import { renderPptxFileToSlides } from './pptxParser';

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error('Invalid image file'));
    img.src = dataUrl;
  });
}

async function renderPdfToSlides(file: File): Promise<SlideItem[]> {
  const pdfjs = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjs.getDocument({ data: buffer });
  const pdf = await loadingTask.promise;

  const slides: SlideItem[] = [];
  const baseName = file.name.replace(/\.pdf$/i, '');

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const unscaled = page.getViewport({ scale: 1 });
    // Target crisp ~1600px width while preventing excessive memory allocation
    const scale = Math.min(2.2, Math.max(1.2, 1600 / Math.max(1, unscaled.width)));
    const viewport = page.getViewport({ scale });

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) continue;

    await page.render({ canvasContext: ctx, viewport, canvas }).promise;

    slides.push({
      id: `pdf-${Date.now()}-${pageNum}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${baseName} · Page ${pageNum}`,
      dataUrl: canvas.toDataURL('image/png'),
      width: canvas.width,
      height: canvas.height,
      sourceType: 'pdf',
    });
  }

  return slides;
}

/**
 * Loads uploaded PowerPoint (.pptx), PDF documents, and PNG/JPG/WebP images into SlideItems.
 */
export async function loadSlidesFromFiles(fileList: FileList | File[]): Promise<SlideItem[]> {
  const files = Array.from(fileList);
  const results: SlideItem[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (
      file.type ===
        'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      lower.endsWith('.pptx')
    ) {
      const pptxSlides = await renderPptxFileToSlides(file);
      results.push(...pptxSlides);
    } else if (lower.endsWith('.ppt')) {
      throw new Error(
        'Legacy binary .ppt files are not supported in-browser. Please save as .pptx or export as PDF from PowerPoint.'
      );
    } else if (file.type === 'application/pdf' || lower.endsWith('.pdf')) {
      const pdfSlides = await renderPdfToSlides(file);
      results.push(...pdfSlides);
    } else if (file.type.startsWith('image/') || /\.(png|jpe?g|webp)$/i.test(lower)) {
      const dataUrl = await readFileAsDataUrl(file);
      const { width, height } = await loadImageDimensions(dataUrl);
      results.push({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: file.name.replace(/\.[^/.]+$/, ''),
        dataUrl,
        width,
        height,
        sourceType: 'image',
      });
    }
  }

  return results;
}
