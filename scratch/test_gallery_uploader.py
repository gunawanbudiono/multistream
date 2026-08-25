import requests
import io

import re

s = requests.Session()
login_page = s.get('http://192.168.18.2:7575/login')
csrf_match = re.search(r'name="_csrf" value="([^"]+)"', login_page.text)
csrf_token = csrf_match.group(1) if csrf_match else ''
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123', '_csrf': csrf_token})
print('1. LOGIN ADMIN:', login_res.status_code in [200, 302])

# 2. Test Gallery HTML page
gallery_res = s.get('http://192.168.18.2:7575/gallery')
print('2. GET /gallery STATUS:', gallery_res.status_code == 200)

# 3. Test Disk Usage API with calculated quota
usage_res = s.get('http://192.168.18.2:7575/api/user/disk-usage')
usage_data = usage_res.json()
print('3. DISK USAGE QUOTA COMPUTATION:', usage_data.get('success') == True)
print(f"   -> Disk Usage: {usage_data.get('diskUsage')} bytes")
print(f"   -> Disk Limit: {usage_data.get('diskLimit')} bytes ({usage_data.get('quotaGb')} GB)")

# 4. Test Universal Upload with an Image
dummy_png = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82'
files = {'media': ('test_banner.png', io.BytesIO(dummy_png), 'image/png')}
up_res = s.post('http://192.168.18.2:7575/api/media/upload-universal', files=files)
up_data = up_res.json()
print('4. UNIVERSAL IMAGE UPLOAD SUCCESS:', up_data.get('success') == True)
print(f"   -> Message: {up_data.get('message')}")

uploaded_id = None
if up_data.get('files') and len(up_data.get('files')) > 0:
    uploaded_id = up_data.get('files')[0].get('id')
    print(f"   -> File format: {up_data.get('files')[0].get('format')}")

# 5. Test Fast Thumbnail / Static Caching Header
cache_test = s.get('http://192.168.18.2:7575/images/mediafire.png')
cache_header = cache_test.headers.get('Cache-Control', '')
print('5. INSTANT FAST CACHING HEADER VERIFIED:', 'max-age' in cache_header and 'public' in cache_header)
print(f"   -> Cache-Control: {cache_header}")

# Clean up dummy image
if uploaded_id:
    del_res = s.delete(f'http://192.168.18.2:7575/api/videos/{uploaded_id}').json()
    print('6. CLEANUP TEST IMAGE SUCCESS:', del_res.get('success') == True)
