import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

# Init dummy chunk upload
init_res = s.post('http://192.168.18.2:7575/api/videos/chunk/init', json={
    'filename': 'test_cancel_cleanup_video.mp4',
    'fileSize': 100 * 1024 * 1024,
    'totalChunks': 2
})
init_data = init_res.json()
upload_id = init_data.get('uploadId')
print('2. INIT CHUNK SESSION:', init_data.get('success') == True, f'uploadId={upload_id}')

# Upload 1 dummy chunk
dummy_chunk = b'0' * (1024 * 1024)
chunk_res = s.post('http://192.168.18.2:7575/api/videos/chunk/upload', data=dummy_chunk, headers={
    'Content-Type': 'application/octet-stream',
    'X-Upload-Id': upload_id,
    'X-Chunk-Index': '0'
})
print('3. UPLOAD CHUNK 0:', chunk_res.status_code == 200)

# Cancel upload
cancel_res = s.post('http://192.168.18.2:7575/api/videos/chunk/cancel', json={'uploadId': upload_id})
print('4. INSTANT CANCEL & CLEANUP API:', cancel_res.json().get('success') == True)
