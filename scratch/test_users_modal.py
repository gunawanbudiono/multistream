import requests

s = requests.Session()
login_res = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
print('1. LOGIN ADMIN:', login_res.status_code == 200)

r_users = s.get('http://192.168.18.2:7575/users')
r_dash = s.get('http://192.168.18.2:7575/dashboard')

# 2. Check Watermark & Unallocated Badge removal
print('2. FOOTER WATERMARK REMOVED (NO "v2.2.2"):', 'v2.2.2' not in r_users.text and 'v2.2.2' not in r_dash.text)
print('3. UNALLOCATED BADGE REMOVED FROM CARD 2:', 'uppercase tracking-wider">Unallocated</span>' not in r_users.text)

# 4. Check ESC listener & Dynamic Search Empty State
print('4. ESCAPE KEY LISTENER PRESENT:', 'e.key === \'Escape\'' in r_users.text)
print('5. DYNAMIC SEARCH EMPTY STATE PRESENT:', 'searchNoMatchRow' in r_users.text)

# 5. Security Safeguards: Self-Action Prevention
admin_id = 'bdb0aa84-e0ce-4c04-a0d0-7e44bc6eef35'

# Attempt self-suspend
res_suspend = s.post('http://192.168.18.2:7575/api/users/status', json={'userId': admin_id, 'status': 'inactive'})
print('6. SELF-SUSPEND BLOCKED (400):', res_suspend.status_code == 400)

# Attempt self-delete
res_delete = s.post('http://192.168.18.2:7575/api/users/delete', json={'userId': admin_id})
print('7. SELF-DELETE BLOCKED (400):', res_delete.status_code == 400)

# Attempt self-demote
res_demote = s.post('http://192.168.18.2:7575/api/users/update', data={'userId': admin_id, 'role': 'member'})
print('8. SELF-DEMOTE BLOCKED (400):', res_demote.status_code == 400)
