import cv2
import face_recognition
import numpy as np
import time
from datetime import datetime
import os
import base64  # <-- Tambahan baru untuk Strategi 2
from firebase_config import initialize_firebase
import serial

# --- KONFIGURASI ARDUINO ---
# GANTI 'COM3' DENGAN PORT ARDUINO MEGA ANDA (Lihat di Arduino IDE)
ARDUINO_PORT = 'COM15' 
BAUD_RATE = 9600

print(f"[INFO] Mencoba terhubung ke Arduino di {ARDUINO_PORT}...")
try:
    arduino = serial.Serial(ARDUINO_PORT, BAUD_RATE, timeout=1)
    time.sleep(2) # Wajib jeda 2 detik karena Arduino merestart saat koneksi serial dibuka
    print("[SUCCESS] Terhubung ke Arduino Mega!")
except Exception as e:
    print(f"[ERROR] Gagal terhubung ke Arduino. Cek kabel USB dan pastikan port {ARDUINO_PORT} benar.")
    print(f"[ERROR] Detail: {e}")
    arduino = None # Lanjut tanpa hardware jika error (untuk testing)

# --- KONFIGURASI ---
HOLD_TIME = 2.0  
TOLERANCE = 0.4  

# 1. Inisialisasi Firebase
db_conn = initialize_firebase()
ref_logs = db_conn.reference('logs') # untuk logs
ref_queue = db_conn.reference('registration_queue') # untuk mendapat wajah baru
ref_commands = db_conn.reference('door_commands') # untuk membuka pintu melalui web

known_face_encodings = []
known_face_names = []

# --- FUNGSI BANTUAN UNTUK LISTENER ---
def proses_data_wajah(key, val):
    if isinstance(val, dict) and 'name' in val and 'image_base64' in val:
        nama_user = val['name']
        base64_str = val['image_base64']
        
        print(f"\n[CLOUD] ☁️ Menerima pendaftaran wajah baru: {nama_user}")
        
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        
        path_simpan = os.path.join('users', f"{nama_user}.jpg")
        try:
            with open(path_simpan, "wb") as fh:
                fh.write(base64.b64decode(base64_str))
            
            img = face_recognition.load_image_file(path_simpan)
            encodings = face_recognition.face_encodings(img)
            if len(encodings) > 0:
                known_face_encodings.append(encodings[0])
                known_face_names.append(nama_user)
                print(f"[SUCCESS] ✅ Wajah {nama_user} siap digunakan!")
            else:
                print(f"[WARNING] ⚠️ Wajah tidak terdeteksi pada foto {nama_user}")
                os.remove(path_simpan)
                
            # Hapus antrean berdasarkan Key/ID yang tepat
            ref_queue.child(key).delete()
            print("[CLOUD] 🧹 Antrean dibersihkan.")
            
        except Exception as e:
            print(f"[ERROR] Gagal memproses gambar dari cloud: {e}")

# KONFIGURASI ANTRIAN UNTUK MENDAPATKAN DATA SEMENTARA DARI DATABASE YANG LEWAT SEMENTARA SAJA
# INI NANTI KALAU UDAH JADI BISA DIGANTI
# AKAN LANGSUNG MENGHAPUS DATA DARI DATABASE 'users'
def handle_new_registration(event):
    if event.data is None:
        return
        
    # Skenario A: Initial Load (Membaca sisa antrean lama)
    if event.path == '/':
        if isinstance(event.data, dict):
            for key, val in event.data.items():
                proses_data_wajah(key, val)
    
    # Skenario B: Real-time Update (Ada 1 data baru masuk saat program jalan)
    else:
        key = event.path.replace('/', '') # Mengambil ID antrean
        val = event.data
        proses_data_wajah(key, val)


# MENANGANI INFORMASI BARU DARI DATABASE BERUPA OPEN ATAU CLOSE
def handle_door_commands(event):
    if event.data is None:
        return

    def proses_buka_pintu(key, val):
        if isinstance(val, dict) and val.get('command') == 'OPEN':
            admin_email = val.get('requestedBy', 'Admin')
            print(f"\n[CLOUD] 🔓 Perintah BUKA PINTU jarak jauh diterima dari: {admin_email}")
            
            # Kirim sinyal ke hardware
            if arduino is not None:
                try:
                    arduino.write(b'O')
                    print("[HARDWARE] Sinyal 'O' dikirim ke motor Servo via Remote.")
                except Exception as e:
                    print(f"[ERROR HARDWARE] Gagal mengirim sinyal ke Arduino: {e}")
            else:
                print("[WARNING] Arduino tidak terhubung. Simulasi pintu terbuka.")
            
            # Hapus perintah dari database agar tidak dieksekusi ulang
            ref_commands.child(key).delete()

    # Skenario A: Initial Load
    if event.path == '/':
        if isinstance(event.data, dict):
            for key, val in event.data.items():
                proses_buka_pintu(key, val)
    # Skenario B: Real-time Update
    else:
        key = event.path.replace('/', '')
        val = event.data
        proses_buka_pintu(key, val)

# Pasang "Telinga" ke Firebase
print("[INFO] 🎧 Mendengarkan perintah dari Cloud Dashboard...")
db_listener = ref_queue.listen(handle_new_registration)

print("[INFO] 🎧 Mendengarkan perintah remote control pintu...")
db_listener_commands = ref_commands.listen(handle_door_commands)

# MENGAMBIL DATA DARI LOCAL 'users'
def load_faces_from_local():
    print("[INFO] Membaca data wajah dari folder lokal 'users/'...")
    for filename in os.listdir('users'):
        if filename.endswith('.jpg') or filename.endswith('.png'):
            path_to_file = os.path.join('users', filename)
            img = face_recognition.load_image_file(path_to_file)
            encodings = face_recognition.face_encodings(img)
            if len(encodings) > 0:
                known_face_encodings.append(encodings[0])
                name = filename.split('.')[0].upper()
                known_face_names.append(name)
                print(f"[SUCCESS] Wajah '{name}' berhasil dipelajari.")

load_faces_from_local()

cap = cv2.VideoCapture(0)
print("[INFO] Kamera Aktif. Menunggu wajah...")

cooldown = False
cooldown_time = 0
face_timers = {} 

# --- FUNGSI BARU: Konversi Wajah ke Base64 ---
def get_base64_face(img, y1, x2, y2, x1):
    try:
        # 1. Crop (potong) gambar hanya di area wajah
        # Tambahkan sedikit padding (margin) agar tidak terlalu nge-zoom
        pad = 20
        h, w, _ = img.shape
        y1_p = max(0, y1 - pad)
        y2_p = min(h, y2 + pad)
        x1_p = max(0, x1 - pad)
        x2_p = min(w, x2 + pad)
        
        cropped_face = img[y1_p:y2_p, x1_p:x2_p]
        
        # 2. Perkecil ukuran gambar menjadi 100x100 pixel agar teks Base64 tidak terlalu panjang
        resized_face = cv2.resize(cropped_face, (100, 100))
        
        # 3. Ubah gambar OpenCV ke format memori JPG
        _, buffer = cv2.imencode('.jpg', resized_face)
        
        # 4. Ubah ke Base64 string
        base64_str = base64.b64encode(buffer).decode('utf-8')
        
        # Tambahkan prefix agar bisa langsung dibaca oleh tag <img> di Web HTML/React
        return f"data:image/jpeg;base64,{base64_str}"
    except Exception as e:
        print(f"[WARNING] Gagal crop wajah: {e}")
        return ""
    
while True:
    success, img = cap.read()
    if not success:
        break

    rgb_img = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    rgb_img_strict = np.ascontiguousarray(rgb_img[:, :, :3], dtype=np.uint8)

    facesCurFrame = face_recognition.face_locations(rgb_img_strict)
    encodesCurFrame = face_recognition.face_encodings(rgb_img_strict, facesCurFrame)
    names_in_current_frame = []

    for encodeFace, faceLoc in zip(encodesCurFrame, facesCurFrame):
        matches = face_recognition.compare_faces(known_face_encodings, encodeFace, tolerance=TOLERANCE)
        faceDis = face_recognition.face_distance(known_face_encodings, encodeFace)
        y1, x2, y2, x1 = faceLoc

        if len(faceDis) > 0:
            matchIndex = np.argmin(faceDis)
            
            # --- JIKA WAJAH DIKENALI ---
            if matches[matchIndex]:
                name = known_face_names[matchIndex]
                names_in_current_frame.append(name)
                
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
                cv2.putText(img, name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
                
                if name not in face_timers:
                    face_timers[name] = time.time()
                else:
                    elapsed_time = time.time() - face_timers[name]
                    cv2.putText(img, f"Auth: {elapsed_time:.1f}s / {HOLD_TIME}s", (x1, y2 + 25), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)
                    
                    if elapsed_time >= HOLD_TIME:
                        if not cooldown:
                            print(f"\n[ACTION] Membuka pintu untuk: {name}")
                            
                            if arduino is not None:
                                try :
                                    arduino.write(b'O') # Mengirim huruf 'O' dalam format bytes
                                    print("[HARDWARE] Sinyal 'O' dikirim ke motor Servo.")
                                except Exception as e :
                                    print(f"[ERROR HARDWARE] Gagal mengirim sinyal ke Arduino: {e}")
                            
                            # Ambil foto snapshot Base64
                            base64_image = get_base64_face(img, y1, x2, y2, x1)
                            
                            try:
                                ref_logs.push({
                                    'name': name,
                                    'timestamp': str(datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                                    'method': 'Face ID',
                                    'snapshot': base64_image # <-- Gambar disisipkan ke database
                                })
                                print("[SUCCESS] Data & Foto berhasil dicatat ke Firebase!")
                            except Exception as e:
                                print(f"[ERROR] Gagal mengirim ke Firebase: {e}")
                                
                            cooldown = True
                            cooldown_time = time.time()
                            face_timers.pop(name) 
                            
            # --- JIKA WAJAH TIDAK DIKENAL (UNKNOWN) ---
            else:
                name = "UNKNOWN"
                names_in_current_frame.append(name)
                
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(img, name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                
                # Kita juga bisa mencatat wajah orang asing jika dia berdiri lebih dari 3 detik
                if name not in face_timers:
                    face_timers[name] = time.time()
                else:
                    elapsed_time = time.time() - face_timers[name]
                    if elapsed_time >= 3.0: # 3 Detik untuk orang asing
                        if not cooldown:
                            print(f"\n[WARNING] Penyusup terdeteksi!")
                            base64_image = get_base64_face(img, y1, x2, y2, x1)
                            try:
                                ref_logs.push({
                                    'name': 'UNKNOWN',
                                    'timestamp': str(datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                                    'method': 'Intruder Alert',
                                    'snapshot': base64_image
                                })
                                print("[SUCCESS] Foto penyusup dicatat ke Firebase!")
                            except Exception as e:
                                print(f"[ERROR] {e}")
                            cooldown = True
                            cooldown_time = time.time()
                            face_timers.pop(name)

    names_to_remove = [n for n in face_timers.keys() if n not in names_in_current_frame]
    for n in names_to_remove:
        face_timers.pop(n)

    if cooldown and (time.time() - cooldown_time > 10):
        cooldown = False
        print("[SYSTEM] Siap memindai lagi.")

    cv2.imshow('Smart Door Lock', img)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

cap.release()
cv2.destroyAllWindows()



if 'arduino' in locals() and arduino is not None and arduino.is_open:
    arduino.close()
    print("[INFO] Koneksi ke Arduino telah ditutup dengan aman.")

if 'db_listener' in locals() :
    db_listener.close()

if 'db_listener_command' in locals() :
    db_listener_commands.close()

# 2. Hapus seluruh sesi Firebase dari memori aplikasi
import firebase_admin
try:
    app = firebase_admin.get_app()
    firebase_admin.delete_app(app)
    print("[INFO] 🛑 Koneksi utama Firebase diputus secara total.")
except Exception as e:
    pass

print("[SYSTEM] Program dihentikan sepenuhnya. Sampai jumpa!")