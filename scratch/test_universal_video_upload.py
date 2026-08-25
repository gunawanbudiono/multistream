import requests, io

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('Login status:', login_res.status_code)

# Test with a dummy mp4 buffer or image
dummy_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
files = {'media': ('test_probe_verify.png', io.BytesIO(dummy_png), 'image/png')}
res = s.post('http://192.168.18.2:7575/api/media/upload-universal', files=files)
data = res.json()
print('Upload result:', data.get('success'), data.get('message'))

if data.get('files') and len(data.get('files')) > 0:
    vid_id = data.get('files')[0].get('id')
    s.delete(f'http://192.168.18.2:7575/api/videos/{vid_id}')
    print('Cleaned up test file')
