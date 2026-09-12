UPDATE school_contract_templates SET body = regexp_replace(
  regexp_replace(
    regexp_replace(
      regexp_replace(body, 'NUOTOLINIŲ PAPILDOMŲ PAMOKŲ', 'NUOTOLINIŲ PAPILDOMŲ UŽSIĖMIMŲ', 'g'),
      'papildomų pamokų', 'papildomų užsiėmimų', 'gi'),
    'PAMOKŲ', 'UŽSIĖMIMŲ', 'g'),
  'Pamokų', 'Užsiėmimų', 'g')
WHERE id IN ('c3a00000-7e57-4000-8000-0000000000a3', 'c3a00000-7e57-4000-8000-0000000000a4');;
