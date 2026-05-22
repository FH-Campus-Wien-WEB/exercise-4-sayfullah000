function setMovie(movie) {

  const form = document.forms[0];

  for (const element of form.elements) {

    if (!element.id) continue;

    const name = element.id;
    const value = movie[name];

    // Genres
    if (name === "Genres") {

      if (!Array.isArray(value)) continue;

      for (const option of element.options) {
        option.selected = value.includes(option.value);
      }

    }

    // Arrays anzeigen
    else if (Array.isArray(value)) {

      element.value = value.join(", ");

    }

    // Normale Werte
    else {

      element.value = value ?? "";
    }
  }
}

function getMovie() {

  const movie = {};

  const form = document.forms[0];

  const elements =
    Array.from(form.elements)
      .filter(element => element.id);

  for (const element of elements) {

    const name = element.id;

    let value;

    // Genres
    if (name === "Genres") {

      value = [];

      for (const option of element.options) {

        if (option.selected) {
          value.push(option.value);
        }
      }
    }

    // Zahlenfelder
    else if (
      name === "Metascore" ||
      name === "Runtime" ||
      name === "imdbRating"
    ) {

      value = Number(element.value);

    }

    // Arrays
    else if (
      name === "Actors" ||
      name === "Directors" ||
      name === "Writers"
    ) {

      value = element.value
        .split(",")
        .map(item => item.trim())
        .filter(item => item.length > 0);

    }

    // Standard
    else {

      value = element.value;
    }

    movie[name] = value;
  }

  return movie;
}

function putMovie() {

  const movie = getMovie();

  const xhr = new XMLHttpRequest();

  xhr.onload = function () {

    if (xhr.status === 200 || xhr.status === 204) {

      location.href = "index.html";

    } else {

      alert(
        "Saving failed. Status: " +
        xhr.status
      );
    }
  };

  xhr.onerror = function () {

    alert("Network error while saving movie");
  };

  xhr.open(
    "PUT",
    "/movies/" + movie.imdbID
  );

  xhr.setRequestHeader(
    "Content-Type",
    "application/json"
  );

  xhr.send(JSON.stringify(movie));
}


// Movie laden
const imdbID =
  new URLSearchParams(window.location.search)
    .get("imdbID");

if (imdbID) {

  const xhr = new XMLHttpRequest();

  xhr.open(
    "GET",
    "/movies/" + imdbID
  );

  xhr.onload = function () {

    if (xhr.status === 200) {

      const movie =
        JSON.parse(xhr.responseText);

      setMovie(movie);

    } else {

      alert(
        "Loading movie failed. Status: " +
        xhr.status
      );
    }
  };

  xhr.onerror = function () {

    alert(
      "Network error while loading movie"
    );
  };

  xhr.send();
}