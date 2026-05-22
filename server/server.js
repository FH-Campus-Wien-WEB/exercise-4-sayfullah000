const express = require("express");
const path = require("path");
const bodyParser = require("body-parser");
const session = require("express-session");
const bcrypt = require("bcrypt");
const config = require("./config.js");
const movieModel = require("./movie-model.js");
const userModel = require("./user-model.js");

const app = express();

app.use(bodyParser.json());

app.use(
  session({
    secret: config.sessionSecret,
    resave: true,
    saveUninitialized: true,
    cookie: {
      secure: false,
      httpOnly: true,
      sameSite: "lax",
    },
  })
);

app.use(express.static(path.join(__dirname, "files")));

function requireLogin(req, res, next) {
  if (req.session && req.session.user) {
    next();
  } else {
    res.sendStatus(401);
  }
}

// LOGIN
app.post("/login", function (req, res) {
  const { username, password } = req.body;
  const user = userModel[username];

  if (user && bcrypt.compareSync(password, user.password)) {
    req.session.user = {
      username,
      firstName: user.firstName,
      lastName: user.lastName,
      loginTime: new Date().toISOString(),
    };
    req.session.save(function (err) {
      if (err) {
        return res.sendStatus(500);
      }
      res.send(req.session.user);
    });
  } else {
    res.sendStatus(401);
  }
});

// LOGOUT
app.get("/logout", function (req, res) {
  req.session.destroy(function (err) {
    if (err) {
      return res.sendStatus(500);
    }
    res.clearCookie("connect.sid");
    res.sendStatus(200);
  });
});

// SESSION
app.get("/session", function (req, res) {
  if (req.session && req.session.user) {
    res.send(req.session.user);
  } else {
    res.status(401).json(null);
  }
});

// GET ALL MOVIES
app.get("/movies", requireLogin, function (req, res) {
  const username = req.session.user.username;
  let movies = Object.values(movieModel.getUserMovies(username));

  const queriedGenre = req.query.genre;
  if (queriedGenre) {
    movies = movies.filter((movie) => movie.Genres.includes(queriedGenre));
  }

  res.send(movies);
});

// GET SINGLE MOVIE
app.get("/movies/:imdbID", requireLogin, function (req, res) {
  const username = req.session.user.username;
  const movie = movieModel.getUserMovie(username, req.params.imdbID);

  if (movie) {
    res.send(movie);
  } else {
    res.sendStatus(404);
  }
});

// ADD OR UPDATE MOVIE
app.put("/movies/:imdbID", requireLogin, function (req, res) {
  const username = req.session.user.username;
  const imdbID = req.params.imdbID;
  const exists = movieModel.getUserMovie(username, imdbID) !== undefined;

  if (!exists) {
    const omdbUrl = `https://www.omdbapi.com/?i=${encodeURIComponent(imdbID)}&apikey=${config.omdbApiKey}`;

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      config.omdbTimeoutMs
    );

    fetch(omdbUrl, { signal: controller.signal })
      .then((apiRes) => {
        clearTimeout(timeoutId);
        if (!apiRes.ok) return res.sendStatus(apiRes.status);

        return apiRes.json().then((data) => {
          if (data.Response !== "True") return res.sendStatus(404);

          const parseDate = (str) => {
            if (!str || str === "N/A") return null;
            const d = new Date(str);
            return isNaN(d.getTime()) ? null : d.toISOString().split("T")[0];
          };

          const movie = {
            imdbID: data.imdbID,
            Title: data.Title,
            Released: parseDate(data.Released),
            Runtime: isNaN(parseInt(data.Runtime))
              ? null
              : parseInt(data.Runtime),
            Genres: data.Genre !== "N/A" ? data.Genre.split(", ") : [],
            Directors:
              data.Director !== "N/A" ? data.Director.split(", ") : [],
            Writers: data.Writer !== "N/A" ? data.Writer.split(", ") : [],
            Actors: data.Actors !== "N/A" ? data.Actors.split(", ") : [],
            Plot: data.Plot !== "N/A" ? data.Plot : null,
            Poster: data.Poster !== "N/A" ? data.Poster : null,
            Metascore: isNaN(parseInt(data.Metascore))
              ? null
              : parseInt(data.Metascore),
            imdbRating: isNaN(parseFloat(data.imdbRating))
              ? null
              : parseFloat(data.imdbRating),
          };

          movieModel.setUserMovie(username, imdbID, movie);
          res.sendStatus(201);
        });
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        if (err.name === "AbortError") return res.sendStatus(504);
        console.error(err);
        res.sendStatus(500);
      });
  } else {
    movieModel.setUserMovie(username, imdbID, req.body);
    res.sendStatus(200);
  }
});

// DELETE MOVIE
app.delete("/movies/:imdbID", requireLogin, function (req, res) {
  const username = req.session.user.username;
  const ok = movieModel.deleteUserMovie(username, req.params.imdbID);

  if (ok) {
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// GENRES
app.get("/genres", requireLogin, function (req, res) {
  const username = req.session.user.username;
  const genres = movieModel.getGenres(username);
  genres.sort();
  res.send(genres);
});

// SEARCH OMDb
app.get("/search", requireLogin, function (req, res) {
  const username = req.session.user.username;
  const query = req.query.query;

  if (!query) return res.sendStatus(400);

  const url = `https://www.omdbapi.com/?s=${encodeURIComponent(query)}&apikey=${config.omdbApiKey}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    config.omdbTimeoutMs
  );

  fetch(url, { signal: controller.signal })
    .then((apiRes) => {
      clearTimeout(timeoutId);
      if (!apiRes.ok) return res.sendStatus(apiRes.status);

      return apiRes.json().then((response) => {
        if (response.Response === "True") {
          const results = response.Search.filter(
            (movie) => !movieModel.hasUserMovie(username, movie.imdbID)
          ).map((movie) => ({
            Title: movie.Title,
            imdbID: movie.imdbID,
            Year: isNaN(parseInt(movie.Year)) ? null : parseInt(movie.Year),
          }));
          res.send(results);
        } else {
          res.send([]);
        }
      });
    })
    .catch((err) => {
      clearTimeout(timeoutId);
      if (err.name === "AbortError") return res.sendStatus(504);
      console.error(err);
      res.sendStatus(500);
    });
});

// START
app.listen(config.port);
console.log(`Server now listening on http://localhost:${config.port}/`);