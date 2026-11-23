# Собранные фронтенды

Сюда кладутся сборки, которые будет отдавать демо-бэкенд:

- `aurora/` — `dist/` прод-Авроры (`/Users/artnavsegda/Desktop/aurora/dist`);
- `halo/` — `dist/` Halo (`donyx/dist`).

Для локального запуска можно не копировать, а указать путь к одной сборке:

```sh
FRONTEND_DIST=/Users/artnavsegda/Desktop/aurora/dist npm start
FRONTEND_DIST=/Users/artnavsegda/Documents/GitHub/donyx/dist PORT=8098 npm start
```

В Docker эти каталоги монтируются или копируются на этапе сборки.
