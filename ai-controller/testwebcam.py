import cv2
import face_recognition
import numpy as np

cap = cv2.VideoCapture(0)
print("[INFO] Membuka kamera...")

while True:
    success, img = cap.read()
    
    if not success:
        print("Gagal membaca kamera.")
        break

    # 1. Konversi bawaan OpenCV
    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # 2. PAKSAAN ABSOLUT: 
    # Ambil hanya 3 channel warna [:, :, :3] untuk membuang alpha channel jika ada.
    # Ubah tipe data secara paksa menjadi unsigned 8-bit integer (np.uint8).
    # Buat susunan memorinya berurutan (ascontiguousarray).
    rgb_img_strict = np.ascontiguousarray(rgb_img[:, :, :3], dtype=np.uint8)

    try:
        # 3. Deteksi Wajah
        facesCurFrame = face_recognition.face_locations(rgb_img_strict)
        
        # 4. Gambar kotak
        for faceLoc in facesCurFrame:
            y1, x2, y2, x1 = faceLoc
            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)

        cv2.imshow('Test Webcam', img)
        
    except Exception as e:
        print("\n--- TERJADI ERROR ---")
        print("Pesan Error:", e)
        print("Bentuk Array Gambar (Shape):", rgb_img_strict.shape)
        print("Tipe Data Gambar (Dtype):", rgb_img_strict.dtype)
        print("---------------------\n")
        break # Hentikan program agar terminal tidak spam
    
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()