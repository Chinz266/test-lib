import { Component, PLATFORM_ID, Inject } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';

// ❌ ห้ามมี import exifr from 'exifr'; ตรงนี้เด็ดขาด ❌

@Component({
  selector: 'app-location',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './location.html',
  styleUrl: './location.scss'
})
export class LocationPage {
  selectedImage: string | ArrayBuffer | null = null;
  latitude: number | null = null;
  longitude: number | null = null;
  locationStatus: string = 'รอการอัปโหลดรูปภาพ...';
  isProcessing: boolean = false;
  logs: string[] = [];

  constructor(@Inject(PLATFORM_ID) private platformId: object) {}

  async onFileSelected(event: Event) {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;

    if (fileList && fileList.length > 0) {
      const file = fileList[0];

      // แสดงรูปพรีวิว
      const reader = new FileReader();
      reader.onload = () => {
        this.selectedImage = reader.result;
      };
      reader.readAsDataURL(file);

      // เรียกใช้งานฟังก์ชันดึงพิกัด
      await this.extractLocation(file);
    }
  }

  async getCurrentLocation() {
    this.addLog('กดปุ่มดึงตำแหน่งปัจจุบัน');

    if (!isPlatformBrowser(this.platformId)) {
      this.locationStatus = 'ไม่สามารถดึงตำแหน่งในโหมด SSR ได้';
      this.addLog(this.locationStatus);
      return;
    }

    if (!('geolocation' in navigator)) {
      this.locationStatus = 'อุปกรณ์นี้ไม่รองรับการดึงตำแหน่ง';
      this.addLog(this.locationStatus);
      return;
    }

    this.isProcessing = true;
    this.locationStatus = 'กำลังดึงตำแหน่งปัจจุบัน...';
    this.latitude = null;
    this.longitude = null;

    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0
        });
      });

      this.latitude = position.coords.latitude;
      this.longitude = position.coords.longitude;
      console.log('[Location] current position', {
        latitude: this.latitude,
        longitude: this.longitude,
        accuracy: position.coords.accuracy
      });
      this.addLog(
        `ตำแหน่งปัจจุบัน: ${this.latitude}, ${this.longitude} (accuracy: ${position.coords.accuracy}m)`
      );
      this.locationStatus = 'ดึงตำแหน่งปัจจุบันสำเร็จ';
    } catch (error) {
      const geolocationError = error as GeolocationPositionError;
      if (geolocationError.code === geolocationError.PERMISSION_DENIED) {
        this.locationStatus = 'ไม่ได้รับอนุญาตให้เข้าถึงตำแหน่ง';
      } else if (geolocationError.code === geolocationError.POSITION_UNAVAILABLE) {
        this.locationStatus = 'ไม่สามารถระบุตำแหน่งได้ในตอนนี้';
      } else if (geolocationError.code === geolocationError.TIMEOUT) {
        this.locationStatus = 'หมดเวลารอการดึงตำแหน่ง';
      } else {
        this.locationStatus = 'เกิดข้อผิดพลาดในการดึงตำแหน่ง';
      }
      this.addLog(`ดึงตำแหน่งไม่สำเร็จ: ${this.locationStatus}`);
    } finally {
      this.isProcessing = false;
    }
  }

  private addLog(message: string) {
    const timestamp = new Date().toLocaleTimeString('th-TH', { hour12: false });
    this.logs.unshift(`[${timestamp}] ${message}`);
    this.logs = this.logs.slice(0, 8);
  }

  async extractLocation(file: File) {
    // เช็คว่าทำงานอยู่บน Browser เท่านั้น
    if (isPlatformBrowser(this.platformId)) {
      this.isProcessing = true;
      this.locationStatus = 'กำลังดึงข้อมูลพิกัด...';
      this.latitude = null;
      this.longitude = null;

      try {
        // ✅ โหลดไลบรารีแบบ Dynamic Import
        const exifr = await import('exifr');
        
        // ดึงเฉพาะข้อมูล GPS ออกมา (ใช้ exifr.default.gps เพื่อรองรับโมดูลแบบ ESM)
        const gpsData = await (exifr.default ? exifr.default.gps(file) : exifr.gps(file));

        if (gpsData) {
          this.latitude = gpsData.latitude;
          this.longitude = gpsData.longitude;
          this.locationStatus = `พบพิกัดสำเร็จ!`;
        } else {
          this.locationStatus = 'ไม่พบข้อมูล GPS ในรูปภาพนี้ (รูปอาจถูกส่งผ่านแชท หรือไม่ได้เปิด Location ตอนถ่าย)';
        }
      } catch (error) {
        console.error('เกิดข้อผิดพลาดในการดึง EXIF:', error);
        this.locationStatus = 'เกิดข้อผิดพลาดในการอ่านพิกัด';
      } finally {
        this.isProcessing = false;
      }
    } else {
      console.log('ข้ามการดึงพิกัดเพราะกำลังอยู่ในโหมด SSR');
    }
  }
}