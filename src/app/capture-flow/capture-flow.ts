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

  async onFileSelected(event: Event): Promise<void> {
    const inputElement = event.currentTarget as HTMLInputElement;
    const files = inputElement.files;

    if (!files || files.length === 0) {
      return;
    }

    const file = files[0];

    this.selectedFileName.set(file.name);
    this.selectedImage.set(await this.convertToDataUrl(file));

    await this.processImageFlow(file);

    inputElement.value = '';
  }

  private async processImageFlow(imageFile: File): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) {
      this.locationStatus.set('ฟีเจอร์นี้ทำงานได้เฉพาะบน Browser');
      this.ocrStatus.set('ฟีเจอร์นี้ทำงานได้เฉพาะบน Browser');
      return;
    }

    this.isProcessing.set(true);
    this.currentStep.set(2);
    this.latitude.set(null);
    this.longitude.set(null);
    this.ocrResult.set('');

    await this.getCurrentLocation();

    this.currentStep.set(3);
    await this.extractTextOrNumber(imageFile);

    this.isProcessing.set(false);
  }

  private async getCurrentLocation(): Promise<void> {
    this.locationStatus.set('กำลังดึงพิกัดปัจจุบัน...');

    if (!('geolocation' in navigator)) {
      this.locationStatus.set('อุปกรณ์นี้ไม่รองรับการดึงตำแหน่งปัจจุบัน');
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
    } catch (error) {
      const geolocationError = error as GeolocationPositionError;

      if (geolocationError.code === geolocationError.PERMISSION_DENIED) {
        this.locationStatus.set('ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่งปัจจุบัน');
        return;
      }

      if (geolocationError.code === geolocationError.POSITION_UNAVAILABLE) {
        this.locationStatus.set('ไม่สามารถระบุตำแหน่งได้ในตอนนี้');
        return;
      }

      if (geolocationError.code === geolocationError.TIMEOUT) {
        this.locationStatus.set('หมดเวลารอการดึงตำแหน่งปัจจุบัน');
        return;
      }

      this.locationStatus.set('เกิดข้อผิดพลาดขณะดึงตำแหน่งปัจจุบัน');
    }
  }

  private async extractTextOrNumber(imageFile: File): Promise<void> {
    this.ocrStatus.set('กำลังอ่านตัวหนังสือ/ตัวเลขจากรูป...');

    try {
      const Tesseract = await import('tesseract.js');
      const result = await Tesseract.recognize(imageFile, 'eng');
      const rawText = result.data.text.trim();
      const numberOnly = rawText.replace(/\D/g, '');

      this.ocrResult.set(numberOnly || rawText);
      this.ocrStatus.set(this.ocrResult() ? 'อ่านข้อมูลจากรูปสำเร็จ' : 'ไม่พบข้อความหรือตัวเลขที่ชัดเจน');
    } catch {
      this.ocrStatus.set('เกิดข้อผิดพลาดขณะอ่านข้อมูลจากรูป');
    }
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
}
