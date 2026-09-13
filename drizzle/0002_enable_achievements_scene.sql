-- Custom SQL migration file, put your code below! --
UPDATE `event`
SET `enabledScenes` = json_insert(`enabledScenes`, '$[#]', 'achievements')
WHERE NOT EXISTS (SELECT 1 FROM json_each(`event`.`enabledScenes`) WHERE json_each.value = 'achievements');
