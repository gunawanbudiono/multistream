import requests

s = requests.Session()
r_login = s.post('http://192.168.18.2:7575/login', data={'username':'ngadimin', 'password':'Jeruksunrise123'})
dash = s.get('http://192.168.18.2:7575/dashboard')
print('1. Logged in as ngadimin. User badge present:', 'ngadimin' in dash.text)

# Impersonate entertainment
imp = s.post('http://192.168.18.2:7575/api/users/16425157-7975-4cbd-9368-2df8cb73a100/impersonate')
print('2. Impersonate response:', imp.json())

imp_dash = s.get('http://192.168.18.2:7575/dashboard')
has_banner = 'Exit Impersonation' in imp_dash.text
has_username = 'entertainment' in imp_dash.text
print('3. Impersonated Dashboard: Has Banner:', has_banner, '| Has Username:', has_username)

# Exit Impersonation
exit_res = s.post('http://192.168.18.2:7575/api/users/exit-impersonate')
print('4. Exit Impersonate response:', exit_res.json())

post_dash = s.get('http://192.168.18.2:7575/dashboard')
print('5. Returned to ngadimin:', 'ngadimin' in post_dash.text)
