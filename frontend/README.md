# Собранные фронтенды

Сюда кладутся сборки, которые будет отдавать демо-бэкенд:

- `aurora/` — `dist/` прод-Авроры **Vue 2**; именно он попадает в Docker-образ;
- `halo/` — `dist/` Halo (`donyx/dist`), только для локальных экспериментов,
  в образ не входит.

Для локального запуска можно не копировать, а указать путь к одной сборке:

```sh
FRONTEND_DIST=/Users/artnavsegda/Desktop/aurora/dist npm start
FRONTEND_DIST=/Users/artnavsegda/Documents/GitHub/donyx/dist PORT=8098 npm start
```

В Docker эти каталоги монтируются или копируются на этапе сборки.
