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
ref_health = db_conn.reference('system_health') # untuk mengecek system health

known_face_encodings = []
known_face_names = []

pending_registrations = []

buka_pintu_dari_web = False

# --- FUNGSI BANTUAN UNTUK LISTENER ---
def proses_data_wajah(key, val):
    if isinstance(val, dict) and 'name' in val and 'image_base64' in val:
        # Resepsionis HANYA menerima data dan menaruhnya di antrean lokal
        nama_user = val['name']
        base64_str = val['image_base64']
        
        pending_registrations.append((key, nama_user, base64_str))
        print(f"\n[CLOUD] 📥 Pesanan wajah baru diterima ({nama_user}). Menunggu diproses...")

# KONFIGURASI ANTRIAN UNTUK MENDAPATKAN DATA SEMENTARA DARI DATABASE YANG LEWAT SEMENTARA SAJA
# INI NANTI KALAU UDAH JADI BISA DIGANTI
# AKAN LANGSUNG MENGHAPUS DATA DARI DATABASE 'registered_faces'
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
# ==========================================
# GANTIKAN MULAI DARI SINI KE BAWAH!
# ==========================================

# MENANGANI INFORMASI BARU DARI DATABASE BERUPA OPEN ATAU CLOSE
def handle_door_commands(event):
    global buka_pintu_dari_web
    
    if event.data is None:
        return

    def proses_buka_pintu(key, val):
        global buka_pintu_dari_web
        if isinstance(val, dict) and val.get('command') == 'OPEN':
            admin_email = val.get('requestedBy', 'Admin')
            print(f"\n[CLOUD] 🔓 Perintah BUKA PINTU jarak jauh diterima dari: {admin_email}")
            
            # Cukup ubah kertas pesan, JANGAN sentuh arduino di sini!
            buka_pintu_dari_web = True
            ref_commands.child(key).delete()

    if event.path == '/':
        if isinstance(event.data, dict):
            for key, val in event.data.items():
                proses_buka_pintu(key, val)
    else:
        key = event.path.replace('/', '')
        val = event.data
        proses_buka_pintu(key, val)

# MENGAMBIL DATA DARI LOCAL 'registered_faces'
def load_faces_from_local():
    print("[INFO] Membaca data wajah dari folder lokal 'registered_faces/'...")
    if not os.path.exists('registered_faces'):
        os.makedirs('registered_faces')
        return
        
    for filename in os.listdir('registered_faces'):
        if filename.endswith('.jpg') or filename.endswith('.png'):
            path_to_file = os.path.join('registered_faces', filename)
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

# Pasang "Telinga" ke Firebase
print("[INFO] 🎧 Mendengarkan perintah dari Cloud Dashboard...")
db_listener = ref_queue.listen(handle_new_registration)

print("[INFO] 🎧 Mendengarkan perintah remote control pintu...")
db_listener_commands = ref_commands.listen(handle_door_commands)

# --- VARIABEL TIMER & COOLDOWN ---
cooldown = False
cooldown_time = 0
face_timers = {} 

# --- TAMBAHAN BARU: Variabel untuk System Health (Detak Jantung) ---
last_health_ping = 0
HEALTH_PING_INTERVAL = 5 # Kirim status setiap 5 detik
# ------------------------------------------------------------------

# --- FUNGSI Konversi Wajah ke Base64 ---
def get_base64_face(img, y1, x2, y2, x1):
    try:
        pad = 20
        h, w, _ = img.shape
        y1_p, y2_p = max(0, y1 - pad), min(h, y2 + pad)
        x1_p, x2_p = max(0, x1 - pad), min(w, x2 + pad)
        
        cropped_face = img[y1_p:y2_p, x1_p:x2_p]
        resized_face = cv2.resize(cropped_face, (100, 100))
        _, buffer = cv2.imencode('.jpg', resized_face)
        base64_str = base64.b64encode(buffer).decode('utf-8')
        return f"data:image/jpeg;base64,{base64_str}"
    except Exception as e:
        print(f"[WARNING] Gagal crop wajah: {e}")
        return ""
    
while True:
    # ==========================================
    # 0. KIRIM DETAK JANTUNG KE FIREBASE (SYSTEM HEALTH)
    # ==========================================
    current_time = time.time()
    if current_time - last_health_ping > HEALTH_PING_INTERVAL:
        try:
            ref_health.set({
                'last_seen': int(current_time * 1000), # Format milidetik untuk Web React
                'camera_active': cap.isOpened(),
                'arduino_active': arduino is not None and arduino.is_open
            })
            last_health_ping = current_time
        except:
            pass # Abaikan jika kebetulan internet putus sekian detik

    # ==========================================
    # 1. CEK ANTREAN WAJAH BARU (Dari Resepsionis)
    # ==========================================
    if len(pending_registrations) > 0:
        key, nama_user, base64_str = pending_registrations.pop(0)
        print(f"[SYSTEM] ⚙️ Memproses dan mempelajari wajah baru: {nama_user}...")
        
        if "," in base64_str:
            base64_str = base64_str.split(",")[1]
        
        path_simpan = os.path.join('registered_faces', f"{nama_user}.jpg")
        try:
            with open(path_simpan, "wb") as fh:
                fh.write(base64.b64decode(base64_str))
            
            img_baru = face_recognition.load_image_file(path_simpan)
            encodings_baru = face_recognition.face_encodings(img_baru)
            
            if len(encodings_baru) > 0:
                known_face_encodings.append(encodings_baru[0])
                known_face_names.append(nama_user)
                print(f"[SUCCESS] ✅ Wajah {nama_user} siap digunakan!")
            else:
                print(f"[WARNING] ⚠️ Wajah tidak terdeteksi pada foto {nama_user}")
                os.remove(path_simpan)
                
            ref_queue.child(key).delete()
            print("[CLOUD] 🧹 Antrean registrasi di Firebase berhasil dibersihkan.")
        except Exception as e:
            print(f"[ERROR] Gagal memproses gambar: {e}")

    # ==========================================
    # 2. SIAPKAN "BENDERA" STATUS UNTUK SAAT INI
    # ==========================================
    perintah_buka_sekarang = False
    metode_akses = ""
    nama_akses = ""
    koordinat_wajah = None 

    success, img = cap.read()
    if not success:
        break

    # ==========================================
    # 3. KONDISI A: APAKAH ADA PERINTAH DARI WEB?
    # ==========================================
    if buka_pintu_dari_web:
        perintah_buka_sekarang = True
        metode_akses = "Remote Web Override"
        nama_akses = "Admin"
        buka_pintu_dari_web = False 

    # ==========================================
    # 4. KONDISI B: APAKAH ADA WAJAH DI KAMERA?
    # ==========================================
    small_frame = cv2.resize(img, (0,0), fx=0.25, fy=0.25)
    rgb_img_strict = np.ascontiguousarray(cv2.cvtColor(small_frame, cv2.COLOR_BGR2RGB)[:, :, :3], dtype=np.uint8)

    facesCurFrame = face_recognition.face_locations(rgb_img_strict)
    encodesCurFrame = face_recognition.face_encodings(rgb_img_strict, facesCurFrame)
    names_in_current_frame = []

    for encodeFace, faceLoc in zip(encodesCurFrame, facesCurFrame):
        matches = face_recognition.compare_faces(known_face_encodings, encodeFace, tolerance=TOLERANCE)
        faceDis = face_recognition.face_distance(known_face_encodings, encodeFace)
        y1, x2, y2, x1 = [val * 4 for val in faceLoc]

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
                    
                    if elapsed_time >= HOLD_TIME and not cooldown:
                        perintah_buka_sekarang = True
                        metode_akses = "Face ID"
                        nama_akses = name
                        koordinat_wajah = (y1, x2, y2, x1) 
            
            # --- JIKA PENYUSUP (UNKNOWN) ---
            else:
                name = "UNKNOWN"
                names_in_current_frame.append(name)
                cv2.rectangle(img, (x1, y1), (x2, y2), (0, 0, 255), 2)
                cv2.putText(img, name, (x1, y1 - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 0, 255), 2)
                
                if name not in face_timers:
                    face_timers[name] = time.time()
                else:
                    elapsed_time = time.time() - face_timers[name]
                    if elapsed_time >= 3.0 and not cooldown:
                        print(f"\n[WARNING] Penyusup terdeteksi!")
                        base64_image = get_base64_face(img, y1, x2, y2, x1)
                        try:
                            ref_logs.push({'name': 'UNKNOWN', 'timestamp': str(datetime.now().strftime("%Y-%m-%d %H:%M:%S")), 'method': 'Intruder Alert', 'snapshot': base64_image})
                        except: pass
                        cooldown = True
                        cooldown_time = time.time()
                        face_timers.pop(name)

    names_to_remove = [n for n in face_timers.keys() if n not in names_in_current_frame]
    for n in names_to_remove:
        face_timers.pop(n)

    # ==========================================
    # 5. EKSEKUSI TUNGGAL & VALIDASI TRANSAKSI
    # ==========================================
    if perintah_buka_sekarang and not cooldown:
        print(f"\n[ACTION] Memproses akses untuk: {nama_akses} (Via: {metode_akses})")
        hardware_berhasil = False 

        # A. Jalankan Hardware Dulu
        if arduino is not None:
            try:
                arduino.write(b'O')
                print("[HARDWARE] Sinyal 'O' berhasil dikirim ke Servo.")
                hardware_berhasil = True 
            except Exception as e:
                print(f"[ERROR] Kabel Arduino Bermasalah: {e}. Auto-Reconnect...")
                try:
                    if arduino.is_open: arduino.close()
                    time.sleep(2)
                    arduino = serial.Serial(ARDUINO_PORT, BAUD_RATE, timeout=1)
                except: pass
        else:
            print("[WARNING] Arduino tidak terhubung. Simulasi pintu terbuka.")
            hardware_berhasil = True

        # B & C. Lanjut ke Database HANYA JIKA Hardware Berhasil
        if hardware_berhasil:
            if koordinat_wajah is not None:
                y1, x2, y2, x1 = koordinat_wajah
                base64_image = get_base64_face(img, y1, x2, y2, x1)
            else:
                img_kecil = cv2.resize(img, (200, 150))
                _, buffer = cv2.imencode('.jpg', img_kecil)
                base64_image = f"data:image/jpeg;base64,{base64.b64encode(buffer).decode('utf-8')}"

            try:
                ref_logs.push({
                    'name': nama_akses,
                    'timestamp': str(datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
                    'method': metode_akses,
                    'snapshot': base64_image
                })
                print("[SUCCESS] Pintu Terbuka! Log Aktivitas tercatat di Cloud.")
            except Exception as e:
                print(f"[ERROR] Gagal mengirim log ke Cloud: {e}")
        else:
            print("[FAILED] Pintu gagal dibuka secara fisik. Akses batal dicatat ke Cloud.")

        cooldown = True
        cooldown_time = time.time()
        if nama_akses in face_timers:
            face_timers.pop(nama_akses)

    # ==========================================
    # 6. MANAJEMEN COOLDOWN & RENDER LAYAR
    # ==========================================
    if cooldown and (time.time() - cooldown_time > 10):
        cooldown = False
        print("[SYSTEM] Siap memindai lagi.")

    cv2.imshow('Smart Door Lock', img)
    if cv2.waitKey(1) & 0xFF == ord('q'):
        break

# ==========================================
# 7. BLOK CLEANUP (BERSIH-BERSIH)
# ==========================================
cap.release()
cv2.destroyAllWindows()

if 'arduino' in locals() and arduino is not None and arduino.is_open:
    arduino.close()
    print("[INFO] Koneksi ke Arduino telah ditutup dengan aman.")

if 'db_listener' in locals() :
    db_listener.close()

if 'db_listener_commands' in locals() :
    db_listener_commands.close()

print("[SYSTEM] Program dihentikan sepenuhnya. Sampai jumpa!")