// Lazy load: không thêm OCR vào bundle chính. Ảnh chỉ được xử lý trong browser;
// lần đầu thư viện/WASM/mô hình tiếng Việt, tiếng Anh tải qua CDN.
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let tesseractPromise;

function loadTesseract() {
  if (typeof window === 'undefined') return Promise.reject(new Error('Chỉ hỗ trợ OCR trên trình duyệt.'));
  if (window.Tesseract?.createWorker) return Promise.resolve(window.Tesseract);
  if (!tesseractPromise) {
    tesseractPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = TESSERACT_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.onload = () => window.Tesseract?.createWorker
        ? resolve(window.Tesseract)
        : reject(new Error('Không khởi tạo được thư viện OCR.'));
      script.onerror = () => reject(new Error('Không tải được OCR. Hãy kiểm tra kết nối Internet hoặc chặn CDN.'));
      document.head.appendChild(script);
    }).catch(error => {
      tesseractPromise = null;
      throw error;
    });
  }
  return tesseractPromise;
}

export async function recognizeReceiptImage(file, onProgress = () => {}) {
  const accepted = ['image/png', 'image/jpeg', 'image/webp'];
  if (!file || !accepted.includes(file.type)) throw new Error('Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Ảnh tối đa 10 MB.');
  if (file.size === 0) throw new Error('Ảnh trống, vui lòng chọn lại.');
  onProgress({ label: 'Đang tải công cụ nhận diện...', percent: 0 });
  const { createWorker } = await loadTesseract();
  let worker;
  try {
    worker = await createWorker(['vie', 'eng'], 1, {
      logger: progress => {
        const percent = Math.round(Math.max(0, Math.min(1, progress.progress || 0)) * 100);
        onProgress({ label: progress.status || 'Đang đọc hóa đơn', percent });
      }
    });
    onProgress({ label: 'Đang phân tích ảnh trên thiết bị...', percent: 0 });
    const result = await worker.recognize(file);
    return { text: result.data.text || '', confidence: result.data.confidence ?? null };
  } finally {
    if (worker) await worker.terminate();
  }
}
