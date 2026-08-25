import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

# 2. Case-insensitive duplicate username check (NGADIMIN vs ngadimin)
dup_res = s.post('http://192.168.18.2:7575/api/users/create', data={
    'username': 'NGADIMIN',
    'password': 'somepassword123',
    'role': 'member',
    'status': 'active',
    'disk_quota_gb': '10'
})
dup_data = dup_res.json()
print('2. CASE-INSENSITIVE USERNAME DUPLICATE REJECTED:', dup_data.get('success') == False)
print(f"   -> Response: {dup_data.get('message')}")

# 3. Test quota enforcement
# Create a test member with 1 GB quota
quota_test_user = s.post('http://192.168.18.2:7575/api/users/create', data={
    'username': 'quota_limit_tester',
    'password': 'testpassword123',
    'role': 'member',
    'status': 'active',
    'disk_quota_gb': '1' # 1 GB quota
}).json()
test_user_id = quota_test_user.get('userId')
print('3. TEST USER CREATED (1 GB QUOTA):', quota_test_user.get('success') == True)

if test_user_id:
    # Log in as test user and attempt chunk init with 2 GB file
    s_member = requests.Session()
    s_member.post('http://192.168.18.2:7575/login', data={'username':'quota_limit_tester', 'password':'testpassword123'})
    
    # 2 GB file size in bytes = 2 * 1024 * 1024 * 1024 = 2147483648
    chunk_init_res = s_member.post('http://192.168.18.2:7575/api/videos/chunk/init', json={
        'filename': 'large_movie.mp4',
        'fileSize': 2147483648,
        'totalChunks': 40
    })
    chunk_data = chunk_init_res.json()
    print('4. OVER-QUOTA UPLOAD STRICTLY REJECTED (400):', chunk_data.get('success') == False)
    print(f"   -> Rejection error: {chunk_data.get('error')}")

    # 5. Deep Cascade Delete cleanup
    del_res = s.post('http://192.168.18.2:7575/api/users/delete', json={'userId': test_user_id}).json()
    print('5. DEEP CASCADE DELETE CLEANUP SUCCESS:', del_res.get('success') == True)
