import { isPlatformBrowser } from '@angular/common';
import { CommonModule } from '@angular/common';
import { Component, Inject, PLATFORM_ID } from '@angular/core';

@Component({
  selector: 'app-read-img',
  standalone: true, 
  imports: [CommonModule],
  templateUrl: './read-img.html',
  styleUrl: './read-img.scss',
})
export class ReadImg {
  selectedImage: string | ArrayBuffer | null = null;
  ocrResult: string = '';
  isProcessing: boolean = false;
  progress: number = 0;
  statusText: string = 'รอการอัปโหลดรูปภาพ...';

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  async onFileSelected(event: Event) {
    console.log('[OCR] onFileSelected triggered');
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;

    if (fileList && fileList.length > 0) {
      const file = fileList[0];
      console.log('[OCR] file selected', {
        name: file.name,
        type: file.type,
        size: file.size
      });
      
      const reader = new FileReader();
      reader.onload = () => {
        this.selectedImage = reader.result;
        console.log('[OCR] preview image loaded');
      };
      reader.readAsDataURL(file);

      await this.extractMeterNumber(file);
    } else {
      console.log('[OCR] no file selected');
    }
  }

  async extractMeterNumber(imageFile: File) {
    if (isPlatformBrowser(this.platformId)) {
      console.log('[OCR] extraction started');
      this.isProcessing = true;
      this.ocrResult = '';
      this.progress = 0;
      
      try {
        const Tesseract = await import('tesseract.js');
        console.log('[OCR] tesseract module loaded', Tesseract);
        
        const preprocessedCanvas = await this.preprocessImageForOcr(imageFile);
        console.log('[OCR] image preprocessing completed');
        
        // 🌟 จุดที่ 1: ดึงฟังก์ชัน createWorker ออกมาให้ถูกที่ (แก้บั๊ก Vercel)
        const createWorkerFn = Tesseract.createWorker || (Tesseract as any).default.createWorker;
        
        // 🌟 จุดที่ 2: ใช้ createWorkerFn และเติม CDN path กันไฟล์หายตอน Deploy
        const worker = await createWorkerFn('eng', 1, {
          workerPath: 'https://unpkg.com/tesseract.js@5.0.5/dist/worker.min.js',
          langPath: 'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0',
          corePath: 'https://unpkg.com/tesseract.js-core@5.0.0',
          logger: m => {
            this.statusText = m.status;
            if (m.status === 'recognizing text') {
              this.progress = Math.round(m.progress * 100);
            }
          }
        });
        console.log('[OCR] worker created');

        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          classify_bln_numeric_mode: '1',
          tessedit_pageseg_mode: (Tesseract.PSM || (Tesseract as any).default.PSM).SINGLE_LINE, // ดักจับเผื่อ PSM พังด้วย
          user_defined_dpi: '300',
          preserve_interword_spaces: '0'
        });
        console.log('[OCR] worker parameters configured');

        const primaryResult = await worker.recognize(preprocessedCanvas);
        console.log('[OCR] primary recognition completed', {
          confidence: primaryResult.data.confidence
        });
        let bestDigits = this.extractBestDigits(primaryResult.data.text);

        if (bestDigits.length < 4) {
          console.log('[OCR] primary result too short, running fallback pass');
          await worker.setParameters({
            tessedit_pageseg_mode: (Tesseract.PSM || (Tesseract as any).default.PSM).SINGLE_BLOCK
          });
          const fallbackResult = await worker.recognize(imageFile);
          console.log('[OCR] fallback recognition completed', {
            confidence: fallbackResult.data.confidence
          });
          const fallbackDigits = this.extractBestDigits(fallbackResult.data.text);

          if (fallbackDigits.length > bestDigits.length) {
            bestDigits = fallbackDigits;
          }
        }
        
        this.ocrResult = bestDigits;
        this.statusText = this.ocrResult
          ? 'อ่านค่าเสร็จสิ้น'
          : 'ไม่พบตัวเลขที่ชัดเจน กรุณาลองถ่ายใหม่ให้ชัดขึ้น';
        console.log('[OCR] final result', { result: this.ocrResult });
        
        await worker.terminate();
        console.log('[OCR] worker terminated');

      } catch (error) {
        console.error('เกิดข้อผิดพลาดจาก Tesseract:', error);
        this.statusText = 'เกิดข้อผิดพลาดในการอ่านมิเตอร์';
      } finally {
        this.isProcessing = false;
        console.log('[OCR] extraction finished', {
          statusText: this.statusText,
          progress: this.progress,
          isProcessing: this.isProcessing
        });
      }
    } else {
      console.log('[OCR] skipped on server-side rendering (SSR)');
    }
  }

  private async preprocessImageForOcr(imageFile: File): Promise<HTMLCanvasElement> {
    const imageBitmap = await createImageBitmap(imageFile);
    const scaleFactor = 2;
    const canvas = document.createElement('canvas');
    canvas.width = imageBitmap.width * scaleFactor;
    canvas.height = imageBitmap.height * scaleFactor;

    const context = canvas.getContext('2d');
    if (!context) {
      imageBitmap.close();
      throw new Error('Cannot create 2D context for OCR preprocessing');
    }

    context.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
    imageBitmap.close();

    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const contrastFactor = 1.5;
    const threshold = 160;

    for (let pixelIndex = 0; pixelIndex < pixels.length; pixelIndex += 4) {
      const red = pixels[pixelIndex];
      const green = pixels[pixelIndex + 1];
      const blue = pixels[pixelIndex + 2];
      const luminance = 0.299 * red + 0.587 * green + 0.114 * blue;
      const contrastedLuminance = Math.max(
        0,
        Math.min(255, (luminance - 128) * contrastFactor + 128)
      );
      const binaryValue = contrastedLuminance > threshold ? 255 : 0;

      pixels[pixelIndex] = binaryValue;
      pixels[pixelIndex + 1] = binaryValue;
      pixels[pixelIndex + 2] = binaryValue;
    }

    context.putImageData(imageData, 0, 0);
    return canvas;
  }

  private extractBestDigits(rawText: string): string {
    const groupedCandidates = rawText.match(/\d{4,}/g) ?? [];
    if (groupedCandidates.length > 0) {
      return groupedCandidates.sort((left, right) => right.length - left.length)[0] ?? '';
    }

    const looseDigits = rawText.replace(/\D/g, '');
    return looseDigits;
  }
}