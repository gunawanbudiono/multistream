import requests

s = requests.Session()
r_login = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
dash = s.get('http://192.168.18.2:7575/dashboard')
print('1. Admin POV: Has Users Menu:', 'href="/users"' in dash.text)

# Impersonate music (member)
imp = s.post('http://192.168.18.2:7575/api/users/b5e49207-e96c-4450-9d0d-32cf4b2d35c5/impersonate')
print('2. Impersonate music response:', imp.json())

imp_dash = s.get('http://192.168.18.2:7575/dashboard')
print('3. Member POV: Has Users Menu (SHOULD BE FALSE):', 'href="/users"' in imp_dash.text)
print('4. Member POV: Has Exit Impersonation Banner:', 'Exit Impersonation' in imp_dash.text)

# Exit Impersonation
exit_res = s.post('http://192.168.18.2:7575/api/users/exit-impersonate')
print('5. Exit Impersonate response:', exit_res.json())

post_dash = s.get('http://192.168.18.2:7575/dashboard')
print('6. Admin POV again: Has Users Menu (SHOULD BE TRUE):', 'href="/users"' in post_dash.text)
