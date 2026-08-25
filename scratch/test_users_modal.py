import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

r_users = s.get('http://192.168.18.2:7575/users')
print('2. GET /users STATUS CODE 200:', r_users.status_code == 200)

# Test creating suspended user and verifying instant block
create_res = s.post('http://192.168.18.2:7575/api/users/create', data={
    'username': 'suspended_test_user',
    'password': 'testpassword123',
    'role': 'member',
    'status': 'inactive',
    'disk_quota_gb': '10'
})
create_data = create_res.json()
test_user_id = create_data.get('userId')
print('3. CREATED SUSPENDED USER:', create_data.get('success') == True)

if test_user_id:
    # Try logging in as suspended user
    s_member = requests.Session()
    mem_login = s_member.post('http://192.168.18.2:7575/login', data={'username':'suspended_test_user', 'password':'testpassword123'}, allow_redirects=False)
    # Trying to access /dashboard
    mem_dash = s_member.get('http://192.168.18.2:7575/dashboard', allow_redirects=False)
    print('4. SUSPENDED USER BLOCKED ON /dashboard (Status 302/403):', mem_dash.status_code in [302, 401, 403])
    if mem_dash.status_code == 302:
        print(f"   -> Redirected to: {mem_dash.headers.get('Location')}")
    
    # Cleanup
    del_res = s.post('http://192.168.18.2:7575/api/users/delete', json={'userId': test_user_id})
    print('5. CLEANUP TEST USER:', del_res.json().get('success') == True)
