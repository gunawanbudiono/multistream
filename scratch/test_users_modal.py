import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

r_users = s.get('http://192.168.18.2:7575/users')

# 2. Check Last Login & Created column in HTML
print('2. LAST LOGIN COLUMN PRESENT IN TABLE:', 'Last Login & Created' in r_users.text)

# 3. Check Tab 3 Activity Logs in Inspector Modal
print('3. TAB 3 ACTIVITY LOGS PRESENT IN INSPECTOR:', 'tabBtnLogs' in r_users.text and 'inspectorTabLogs' in r_users.text)

# 4. Check Inspector endpoint returns logs for admin
admin_id = 'bdb0aa84-e0ce-4c04-a0d0-7e44bc6eef35'
insp_res = s.get(f'http://192.168.18.2:7575/api/users/{admin_id}/inspector')
insp_data = insp_res.json()
print('4. INSPECTOR RETURNS LOGS ARRAY:', 'logs' in insp_data and len(insp_data['logs']) > 0)
if 'logs' in insp_data and len(insp_data['logs']) > 0:
    latest_log = insp_data['logs'][0]
    print(f"   -> Latest log: [{latest_log.get('action_type')}] {latest_log.get('description')} by {latest_log.get('performed_by')}")

# 5. Create test user and verify USER_CREATE log
create_res = s.post('http://192.168.18.2:7575/api/users/create', data={
    'username': 'log_test_user',
    'password': 'testpassword123',
    'role': 'member',
    'status': 'active',
    'disk_quota_gb': '30'
})
create_data = create_res.json()
test_user_id = create_data.get('userId')
print('5. USER CREATED:', create_data.get('success') == True)

if test_user_id:
    user_insp = s.get(f'http://192.168.18.2:7575/api/users/{test_user_id}/inspector').json()
    user_logs = user_insp.get('logs', [])
    has_create_log = any(l.get('action_type') == 'USER_CREATE' for l in user_logs)
    print('6. USER_CREATE ACTION LOGGED IN DB:', has_create_log)
    if has_create_log:
        print(f"   -> Log entry: {user_logs[0].get('description')}")
    
    # Cleanup test user
    del_res = s.post('http://192.168.18.2:7575/api/users/delete', json={'userId': test_user_id})
    print('7. CLEANUP TEST USER:', del_res.json().get('success') == True)
