import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-camera',
  standalone: true,
  imports: [CommonModule], // จำเป็นต้องมีสำหรับ *ngIf
  templateUrl: './camera.html',
  styleUrl: './camera.scss'
})
export class Camera {
  selectedImage: string | ArrayBuffer | null = null;
  selectedFile: File | null = null;

  onFileSelected(event: Event) {
    const element = event.currentTarget as HTMLInputElement;
    const fileList: FileList | null = element.files;

    if (fileList && fileList.length > 0) {
      this.selectedFile = fileList[0];
      
      // สร้างพรีวิวรูปภาพให้แสดงบนหน้าเว็บ
      const reader = new FileReader();
      reader.onload = () => {
        this.selectedImage = reader.result;
      };
      reader.readAsDataURL(this.selectedFile);

      console.log('ถ่ายรูปสำเร็จ ได้ไฟล์:', this.selectedFile.name);
      
      // 💡 พื้นที่สำหรับต่อยอด:
      // คุณสามารถเรียกใช้ฟังก์ชัน extractText() หรือ extractLocation() 
      // เพื่อดึงเลขมิเตอร์และพิกัดจากรูปนี้ต่อได้เลยครับ
    }
  }
}