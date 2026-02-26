import { CommonModule, isPlatformBrowser } from '@angular/common';
import { Component, PLATFORM_ID, signal, inject } from '@angular/core';

@Component({
  selector: 'app-capture-flow',
  imports: [CommonModule],
  templateUrl: './capture-flow.html',
  styleUrl: './capture-flow.scss'
})
export class CaptureFlow {
  private readonly platformId = inject(PLATFORM_ID);

  readonly selectedImage = signal<string | null>(null);
  readonly selectedFileName = signal<string | null>(null);

  readonly isProcessing = signal(false);
  readonly currentStep = signal<1 | 2 | 3>(1);

  readonly locationStatus = signal('ยังไม่เริ่มดึงพิกัด');
  readonly latitude = signal<number | null>(null);
  readonly longitude = signal<number | null>(null);

  readonly ocrStatus = signal('ยังไม่เริ่มอ่านตัวเลข');
  readonly ocrResult = signal('');
  readonly logs = signal<string[]>([]);

  async onFileSelected(event: Event): Promise<void> {
    const inputElement = event.currentTarget as HTMLInputElement;
    const files = inputElement.files;

    if (!files || files.length === 0) {
      this.addLog('ยังไม่ได้เลือกรูปภาพ');
      return;
    }

    const file = files[0];
    this.addLog(`เลือกรูปสำเร็จ: ${file.name} (${Math.round(file.size / 1024)} KB)`);

    this.selectedFileName.set(file.name);
    this.selectedImage.set(await this.convertToDataUrl(file));
    this.addLog('แสดงพรีวิวรูปภาพสำเร็จ');

    await this.processImageFlow(file);

    inputElement.value = '';
  }

  private async processImageFlow(imageFile: File): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.locationStatus.set('ฟีเจอร์นี้ทำงานได้เฉพาะบน Browser');
      this.ocrStatus.set('ฟีเจอร์นี้ทำงานได้เฉพาะบน Browser');
      this.addLog('ยกเลิกการประมวลผล: ไม่ใช่ Browser environment');
      return;
    }

    this.logs.set([]);
    this.addLog('เริ่ม workflow: Step 2 ดึงตำแหน่งปัจจุบัน -> Step 3 อ่าน OCR');
    this.isProcessing.set(true);
    this.currentStep.set(2);
    this.latitude.set(null);
    this.longitude.set(null);
    this.ocrResult.set('');

    await this.getCurrentLocation();

    this.currentStep.set(3);
    await this.extractTextOrNumber(imageFile);

    this.isProcessing.set(false);
    this.addLog('จบ workflow ทั้งหมด');
  }

  private async getCurrentLocation(): Promise<void> {
    this.locationStatus.set('กำลังดึงพิกัดปัจจุบัน...');
    this.addLog('เริ่มดึงตำแหน่งปัจจุบันจากอุปกรณ์');

    if (!('geolocation' in navigator)) {
      this.locationStatus.set('อุปกรณ์นี้ไม่รองรับการดึงตำแหน่งปัจจุบัน');
      this.addLog('อุปกรณ์ไม่รองรับ geolocation');
      return;
    }

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });

      this.latitude.set(position.coords.latitude);
      this.longitude.set(position.coords.longitude);
      this.locationStatus.set('ดึงตำแหน่งปัจจุบันสำเร็จ');
      this.addLog(`ดึงตำแหน่งสำเร็จ: ${position.coords.latitude}, ${position.coords.longitude}`);
    } catch (error) {
      const geolocationError = error as GeolocationPositionError;

      if (geolocationError.code === geolocationError.PERMISSION_DENIED) {
        this.locationStatus.set('ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่งปัจจุบัน');
        this.addLog('ดึงตำแหน่งไม่สำเร็จ: ผู้ใช้ไม่อนุญาตสิทธิ์');
        return;
      }

      if (geolocationError.code === geolocationError.POSITION_UNAVAILABLE) {
        this.locationStatus.set('ไม่สามารถระบุตำแหน่งได้ในตอนนี้');
        this.addLog('ดึงตำแหน่งไม่สำเร็จ: position unavailable');
        return;
      }

      if (geolocationError.code === geolocationError.TIMEOUT) {
        this.locationStatus.set('หมดเวลารอการดึงตำแหน่งปัจจุบัน');
        this.addLog('ดึงตำแหน่งไม่สำเร็จ: timeout');
        return;
      }

      this.locationStatus.set('เกิดข้อผิดพลาดขณะดึงตำแหน่งปัจจุบัน');
      this.addLog('ดึงตำแหน่งไม่สำเร็จ: unknown error');
    }
  }

  private async extractTextOrNumber(imageFile: File): Promise<void> {
    this.ocrStatus.set('กำลังอ่านตัวหนังสือ/ตัวเลขจากรูป...');
    this.addLog('เริ่ม OCR จากรูปภาพ');

    try {
      const Tesseract = await import('tesseract.js');
      const preprocessedCanvas = await this.preprocessImageForOcr(imageFile);
      this.addLog('เตรียมภาพสำหรับ OCR สำเร็จ');

      // 🌟 1. ดึงฟังก์ชัน createWorker และ PSM ออกมาแก้บั๊ก Vercel (Vite)
      const createWorkerFn = Tesseract.createWorker || (Tesseract as any).default.createWorker;
      const PSM = Tesseract.PSM || (Tesseract as any).default.PSM;

      // 🌟 2. เรียกใช้ createWorkerFn พร้อมใส่ CDN ป้องกันไฟล์หาย
      const worker = await createWorkerFn('eng', 1, {
        workerPath: 'https://unpkg.com/tesseract.js@5.0.5/dist/worker.min.js',
        langPath: 'https://raw.githubusercontent.com/naptha/tessdata/gh-pages/4.0.0',
        corePath: 'https://unpkg.com/tesseract.js-core@5.0.0',
      });

      await worker.setParameters({
        tessedit_char_whitelist: '0123456789',
        classify_bln_numeric_mode: '1',
        tessedit_pageseg_mode: PSM.SINGLE_LINE, // ใช้ PSM ที่เราดึงมาใหม่
        user_defined_dpi: '300',
        preserve_interword_spaces: '0'
      });

      const primaryResult = await worker.recognize(preprocessedCanvas);
      let bestDigits = this.extractBestDigits(primaryResult.data.text);

      if (bestDigits.length < 4) {
        await worker.setParameters({
          tessedit_pageseg_mode: PSM.SINGLE_BLOCK // ใช้ PSM ที่เราดึงมาใหม่
        });
        const fallbackResult = await worker.recognize(imageFile);
        const fallbackDigits = this.extractBestDigits(fallbackResult.data.text);

        if (fallbackDigits.length > bestDigits.length) {
          bestDigits = fallbackDigits;
        }
      }

      await worker.terminate();

      this.ocrResult.set(bestDigits);
      this.ocrStatus.set(this.ocrResult() ? 'อ่านข้อมูลจากรูปสำเร็จ' : 'ไม่พบข้อความหรือตัวเลขที่ชัดเจน');
      this.addLog(this.ocrResult() ? `OCR สำเร็จ: ${this.ocrResult()}` : 'OCR ไม่พบข้อความ/ตัวเลขที่ชัดเจน');
    } catch (error) {
      // 🌟 3. ปริ้นต์ Error ออกมาที่ Console ด้วย จะได้รู้ว่าพังเพราะอะไรถ้าเกิดปัญหาอีก
      console.error("🚨 รายละเอียด OCR Error:", error); 
      this.ocrStatus.set('เกิดข้อผิดพลาดขณะอ่านข้อมูลจากรูป');
      this.addLog('OCR เกิดข้อผิดพลาด');
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

    return rawText.replace(/\D/g, '');
  }

  private convertToDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
          return;
        }

        reject(new Error('Image preview conversion failed'));
      };

      reader.onerror = () => reject(new Error('Cannot read selected file'));
      reader.readAsDataURL(file);
    });
  }

  private addLog(message: string): void {
    const timestamp = new Date().toLocaleTimeString('th-TH', { hour12: false });
    const line = `[${timestamp}] ${message}`;
    this.logs.update((entries) => [line, ...entries].slice(0, 12));
    console.log('[CaptureFlow]', message);
  }
}
