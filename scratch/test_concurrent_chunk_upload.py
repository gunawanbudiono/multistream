import requests, concurrent.futures

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

# Init dummy 6-chunk upload
total_chunks = 6
init_res = s.post('http://192.168.18.2:7575/api/videos/chunk/init', json={
    'filename': 'stress_test_video.mp4',
    'fileSize': total_chunks * 50 * 1024 * 1024,
    'totalChunks': total_chunks
})
init_data = init_res.json()
upload_id = init_data.get('uploadId')
print('2. INIT CHUNK SESSION:', init_data.get('success') == True, f'uploadId={upload_id}')

# Concurrently upload chunks in 3 parallel threads
dummy_chunk = b'A' * 1024

def upload_worker(c_idx):
    res = s.post('http://192.168.18.2:7575/api/videos/chunk/upload', data=dummy_chunk, headers={
        'Content-Type': 'application/octet-stream',
        'X-Upload-Id': upload_id,
        'X-Chunk-Index': str(c_idx)
    })
    return c_idx, res.status_code, res.json().get('success')

with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
    results = list(executor.map(upload_worker, range(total_chunks)))

print('3. 3-THREAD PARALLEL CHUNK UPLOADS:', all(r[2] for r in results), results)

# Cleanup
cancel_res = s.post('http://192.168.18.2:7575/api/videos/chunk/cancel', json={'uploadId': upload_id})
print('4. CLEANUP TEST SESSION:', cancel_res.json().get('success') == True)
