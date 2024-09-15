const express = require('express');
const axios = require('axios');
const fs = require('fs');
require('dotenv').config(); 
const app = express();
const PORT = 3000;

app.use(express.json());

const readMoviesFromFile = () => {
  return new Promise((resolve, reject) => {
    fs.readFile('top250.json', 'utf8', (err, data) => {
      if (err) {
        reject('Ошибка при чтении файла: ' + err);
      } else {
        resolve(JSON.parse(data));
      }
    });
  });
};

const writeMoviesToFile = (movies) => {
  return new Promise((resolve, reject) => {
    fs.writeFile('top250.json', JSON.stringify(movies, null, 2), (err) => {
      if (err) {
        reject('Ошибка при записи файла: ' + err);
      } else {
        resolve();
      }
    });
  });
};

app.get('/fetch-top250', async (req, res) => {
  try {
    // первые 250 фильмов по рейтингу с выведенными полями из модели по задаче, с бюджетом, сборами и рейтингом не равными 0
    const response = await axios.get('https://api.kinopoisk.dev/v1.4/movie?page=1&limit=250&selectFields=id&selectFields=name&selectFields=rating&selectFields=year&selectFields=budget&selectFields=fees&selectFields=poster&selectFields=top250&notNullFields=top250&notNullFields=budget.value&notNullFields=fees.world.value&sortField=top250&sortType=1&lists=top250', {
      headers: {
        'accept': 'application/json',
        'X-API-KEY': process.env.API_KEY
      }
    });

    // массив фильмов и преобразуем его в соответствии с моделью
    const movies = response.data.docs.map(movie => ({
      id: movie.id,
      title: movie.name, 
      rating: movie.rating.kp.toFixed(1).toString(), // оценка по кинопоиску
      year: movie.year, 
      budget: movie.budget.value, 
      gross: movie.fees.world.value, 
      poster: movie.poster.url, 
      position: movie.top250 
    }));

    fs.writeFile('top250.json', JSON.stringify(movies, null, 2), (err) => {
      if (err) {
        console.error('Ошибка при записи файла:', err);
        return res.status(500).send('Ошибка при записи файла.');
      }
      console.log('Данные успешно записаны в top250.json');
      res.send('Данные успешно записаны в top250.json');
    });
  } catch (error) {
    console.error('Ошибка при выполнении запроса:', error);
    res.status(500).send('Ошибка при выполнении запроса.');
  }
});

// GET /api/films/readall 
app.get('/api/films/readall', async (req, res) => {
  try {
    const movies = await readMoviesFromFile();
    const sortedMovies = movies.sort((a, b) => a.position - b.position);
    res.json(sortedMovies);
  } 
  catch (error) {
    console.error('Ошибка при обработке запроса:', error);
    res.status(500).send('Ошибка при обработке запроса.');
  }
});

// GET api/films/read
app.get('/api/films/read', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).send('Пожалуйста, укажите id фильма.');
    }

    const movies = await readMoviesFromFile();

    const movie = movies.find(movie => movie.id === id);

    if (movie) {
      res.json(movie);
    } else {
      res.status(404).send('Фильм с указанным id не найден.');
    }
  } catch (error) {
    console.error('Ошибка при обработке запроса:', error);
    res.status(500).send('Ошибка при обработке запроса.');
  }
});

// POST /api/films/create 
app.post('/api/films/create', async (req, res) => {
  try {
    const { title, rating, year, budget, gross, poster, position } = req.body;

    if (!title || !rating || !year || !budget || !gross || !poster || !position) {
      return res.status(400).send('Не все обязательные поля переданы.');
    }

    if (year < 1895) {
      return res.status(400).send('Дата фильма не может быть раньше 1895 года. Кинематограф ввели только в этом году!');
    }

    if (budget < 0 || gross < 0) {
      return res.status(400).send('Бюджет и сборы не могут быть отрицательными.');
    }

    let movies = await readMoviesFromFile();

    // Проверяем, есть ли пробелы между существующими позициями
    const sortedMovies = movies.sort((a, b) => a.position - b.position);
    let newPosition = position;

    // Проверяем наличие пробелов и выбираем ближайшую позицию
    for (let i = 0; i < sortedMovies.length - 1; i++) {
      if (sortedMovies[i].position < newPosition && sortedMovies[i + 1].position > newPosition) {
        if (newPosition > sortedMovies[i].position + 1) {
          newPosition = sortedMovies[i].position + 1;
        }
        break;
      }
    }

    const newMovie = {
      id: Math.round(Date.now() + Math.random() * 1000),
      title,
      rating,
      year,
      budget,
      gross,
      poster,
      position: newPosition
    };

    movies.push(newMovie);
    movies.sort((a, b) => a.position - b.position);

    await writeMoviesToFile(movies);

    res.status(201).json(newMovie);
  } catch (error) {
    console.error('Ошибка при создании фильма:', error);
    res.status(500).send('Ошибка при создании фильма.');
  }
});

// POST /api/films/update 
app.post('/api/films/update', async (req, res) => {
  try {
    const { id, title, rating, year, budget, gross, poster, position } = req.body;

    if (!id) {
      return res.status(400).send('id фильма не передан.');
    }

    if (year < 1895) {
      return res.status(400).send('Дата фильма не может быть раньше 1895 года.');
    }

    if (budget < 0 || gross < 0) {
      return res.status(400).send('Бюджет и сборы не могут быть отрицательными.');
    }

    let movies = await readMoviesFromFile();
    const movieIndex = movies.findIndex(movie => movie.id === id);

    if (movieIndex === -1) {
      return res.status(404).send('Фильм с данным id не найден.');
    }

    const oldPosition = movies[movieIndex].position;

    // Обновляем поля фильма
    if (title !== undefined) movies[movieIndex].title = title;
    if (rating !== undefined) movies[movieIndex].rating = rating;
    if (year !== undefined) movies[movieIndex].year = year;
    if (budget !== undefined) movies[movieIndex].budget = budget;
    if (gross !== undefined) movies[movieIndex].gross = gross;
    if (poster !== undefined) movies[movieIndex].poster = poster;

    // Если позиция изменена, проверяем пробелы
    if (position !== undefined && position !== oldPosition) {
      let newPosition = position;
      const sortedMovies = movies.sort((a, b) => a.position - b.position);

      for (let i = 0; i < sortedMovies.length - 1; i++) {
        if (sortedMovies[i].position < newPosition && sortedMovies[i + 1].position > newPosition) {
          if (newPosition > sortedMovies[i].position + 1) {
            newPosition = sortedMovies[i].position + 1;
          }
          break;
        }
      }

      movies[movieIndex].position = newPosition;
    }

    movies.sort((a, b) => a.position - b.position);
    await writeMoviesToFile(movies);

    res.status(200).json(movies[movieIndex]);
  } catch (error) {
    console.error('Ошибка при обновлении фильма:', error);
    res.status(500).send('Ошибка при обновлении фильма.');
  }
});

// POST /api/films/delete 
app.post('/api/films/delete', async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).send('id фильма не передан.');
    }

    let movies = await readMoviesFromFile();
    const movieIndex = movies.findIndex(movie => movie.id === id);

    if (movieIndex === -1) {
      return res.status(404).send('Фильм с данным id не найден.');
    }

    const deletedMoviePosition = movies[movieIndex].position;
    movies.splice(movieIndex, 1);

    // cдвигаем фильмы, чтобы не было пробелов в позициях
    movies = movies.map(movie => {
      if (movie.position > deletedMoviePosition) {
        movie.position -= 1; 
      }
      return movie;
    });

    await writeMoviesToFile(movies);
    res.status(200).send(`Фильм с id ${id} успешно удален.`);
  } 
  catch (error) {
    console.error('Ошибка при удалении фильма:', error);
    res.status(500).send('Ошибка при удалении фильма.');
  }
});

app.listen(PORT, () => {
  console.log(`Сервер запущен на порту ${PORT}`);
});


