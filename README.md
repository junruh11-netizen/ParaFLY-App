# ParaFLY

A classroom app for the ParaFLY EduProtocol. Teachers paste one to three paragraphs and release them one at a time. Students paraphrase under a timer, the teacher selects anonymous examples, and the class votes on the strongest response.

## Local development

1. Create a PostgreSQL database.
2. Set `DATABASE_URL`.
3. Run `npm install` and `npm start`.
4. Open `http://localhost:3000`.

The server creates its tables automatically. Rooms expire after 24 hours.

## Railway

Create a new Railway project from this repository, add PostgreSQL, and generate a public domain. Railway supplies `DATABASE_URL` to the service.
