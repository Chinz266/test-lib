import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-camera',
  templateUrl: './camera.html',
  styleUrl: './camera.scss'
})
export class Camera {
  readonly selectedImage = signal<string | null>(null);
  readonly selectedFileName = signal<string | null>(null);

  onFileSelected(event: Event) {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;

    if (fileList && fileList.length > 0) {
      const selectedFile = fileList[0];
      
      // สร้างพรีวิวรูปภาพให้แสดงบนหน้าเว็บ
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          this.selectedImage.set(reader.result);
          this.selectedFileName.set(selectedFile.name);
        }
      };
      reader.readAsDataURL(selectedFile);

      console.log('ถ่ายรูปสำเร็จ ได้ไฟล์:', selectedFile.name);

      element.value = '';
      
      // 💡 พื้นที่สำหรับต่อยอด:
      // คุณสามารถเรียกใช้ฟังก์ชัน extractText() หรือ extractLocation() 
      // เพื่อดึงเลขมิเตอร์และพิกัดจากรูปนี้ต่อได้เลยครับ
    }
  }
}