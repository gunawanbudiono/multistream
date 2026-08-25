import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

# 2. Check normalized logo.svg
logo_res = s.get('http://192.168.18.2:7575/images/logo.svg')
print('2. LOGO.SVG NORMALIZED (viewBox="0 0 100 100"):', 'viewBox="0 0 100 100"' in logo_res.text)

# 3. Check Create Modal consistent features in HTML
r_users = s.get('http://192.168.18.2:7575/users')
print('3. CREATE MODAL HAS AVATAR & EYE TOGGLE & STRENGTH METER:', 
      'createUserAvatar' in r_users.text and 
      'createPasswordToggleIcon' in r_users.text and 
      'createPasswordStrengthContainer' in r_users.text and
      'createOverviewProgressBar' in r_users.text)

# 4. Test User Creation with disk_quota_gb persistence
create_res = s.post('http://192.168.18.2:7575/api/users/create', data={
    'username': 'audit_test_75',
    'password': 'testpassword123',
    'role': 'member',
    'status': 'active',
    'disk_quota_gb': '75'
})
create_data = create_res.json()
print('4. USER CREATED SUCCESSFULLY:', create_data.get('success') == True)
created_user_id = create_data.get('userId')

if created_user_id:
    # Verify inspector endpoint or users list shows 75 GB quota
    insp_res = s.get(f'http://192.168.18.2:7575/api/users/{created_user_id}/inspector')
    insp_data = insp_res.json()
    print('   -> User inspected successfully:', insp_data.get('success'))
    
    # Check users table page contains '75 GB'
    r_after_create = s.get('http://192.168.18.2:7575/users')
    print('5. DISK QUOTA (75 GB) PERSISTED IN DATABASE & RENDERED:', '/ 75 GB' in r_after_create.text)

    # 6. Test duplicate username prevention on update
    entertainment_id = '16425157-7975-4cbd-9368-2df8cb73a100'
    dup_res = s.post('http://192.168.18.2:7575/api/users/update', data={
        'userId': entertainment_id,
        'username': 'ngadimin'  # Existing admin username
    })
    print('6. DUPLICATE USERNAME UPDATE BLOCKED (400):', dup_res.status_code == 400)

    # Clean up test user
    del_res = s.post('http://192.168.18.2:7575/api/users/delete', json={'userId': created_user_id})
    print('7. CLEANUP TEST USER (DELETED):', del_res.json().get('success') == True)
