import json

x = {
    'msclkid': None,
    'gclid': None, 'firstpage': '/programs-overview/', 'referrer': 'https://www.cityu.edu/programs-overview/master-teaching/', 'rfipage': 'www.cityu.edu/request-information/', 'utmmedium': 'Organic search', 'utmcontent': 'None', 'utmterm': 'None', 'utmcampaign': 'www.google.com', 'utmsource': 'Google', 'is_visa': 'No',
    'program_of_interest': 'M.Ed. Elementary Education', 'degree_type': "Master's", 'level_of_study': 'Graduate', 'tel': {'number': '(440) 227-9042', 'cleaned': '+14402279042', 'original': '(440)227-9042', 'country_code': 'us', 'dial_code': '1'}, 'email': 'Jenhowell8@gmail.com', 'full_name': {'first_name': 'Jennifer', 'last_name': 'Gordon'}, }

print(json.dumps(x))
