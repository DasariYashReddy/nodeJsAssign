const express = require("express");
const app = express();
const path = require("path");
const sqlite = require("sqlite3");
const { open } = require("sqlite");
const bcrypt = require("bcrypt");
app.use(express.json());
///const { date, format } = require("date-fns");
const dbPath = path.join(__dirname, "twitterClone.db");
const jwt = require("jsonwebtoken");
let db = null;

async function dbStart() {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite.Database,
    });
    app.listen(3000, () => {
      console.log("Server started on http://3000");
    });
  } catch (e) {
    console.log(e.message);
    process.exit(1);
  }
}
dbStart();

const authenticator = (request, response, next) => {
  const auth = request.headers["authorization"];

  if (auth === undefined) {
    response.status(401);
    response.send("Invalid JWT Token");
  } else {
    const authToken = auth.split(" ")[1];
    jwt.verify(authToken, "YASH", async (error, payload) => {
      if (error) {
        response.status(401);
        response.send("Invalid JWT Token");
      } else {
        console.log(payload);
        request.username = payload.username;
        next();
      }
    });
  }
};

///API 1
app.post("/register/", async (request, response) => {
  const { username, password, name, gender } = request.body;
  console.log(username, password, name, gender);
  const findUser = await db.get(
    `SELECT * FROM user WHERE username='${username}';`
  );
  if (findUser !== undefined) {
    response.status(400).send("User already exists");
  } else {
    if (password.length < 6) {
      response.status(400).send("Password is too short");
    } else {
      const hashedPw = await bcrypt.hash(password, 10);
      console.log(hashedPw);
      const query = `INSERT INTO user (username,password,name,gender) VALUES
      ('${username}','${hashedPw}','${name}','${gender}');`;
      await db.run(query);
      response.status(200).send("User created successfully");
    }
  }
});

///API 2
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  const validUser = await db.get(
    `SELECT password FROM user WHERE username='${username}';`
  );
  if (validUser !== undefined) {
    if (await bcrypt.compare(password, validUser.password)) {
      const payload = { username: username };
      const jwtToken = await jwt.sign(payload, "YASH");
      response.status(200).send({ jwtToken });
    } else {
      {
        response.status(400);
        response.send("Invalid password");
      }
    }
  } else {
    response.status(400).send("Invalid user");
  }
});

///API 3 USER FEED
app.get("/user/tweets/feed/", authenticator, async (request, response) => {
  const { username } = request;
  const tweetsQuery = `SELECT username,tweet,date_time as dateTime FROM tweet,user WHERE tweet.user_id IN 
  (SELECT following_user_id from follower WHERE follower_user_id = (SELECT user_id FROM user WHERE username = '${username}'))
  ORDER BY dateTime
  LIMIT 4
  OFFSET 0`;

  //   const tweetsQuery = ` SELECT username,tweet,date_time as dateTime FROM user, tweet,follower WHERE tweet.user_id IN
  //   (SELECT following_user_id FROM follower WHERE follower_user_id = (SELECT user_id FROM user WHERE username='${username}'))
  //   GROUP BY tweet.tweet_id
  //   ORDER BY dateTime LIMIT 4`;

  //   const tweetsQuery = ` SELECT username,tweet,date_time as dateTime FROM user as user INNER JOIN (SELECT * FROM tweet WHERE tweet.user_id IN
  //   (SELECT following_user_id FROM follower WHERE
  //    follower_user_id IN (SELECT user_id FROM user WHERE username = '${username}'))) as tweet WHERE user.user_id = tweet.user_id
  //    ORDER BY tweet.date_time
  //    LIMIT 4
  //    `;
  const dbResult = await db.all(tweetsQuery);

  response.send(dbResult);
});

///API 4 Following list
app.get("/user/following/", authenticator, async (request, response) => {
  const { username } = request;
  const query = `SELECT name from user INNER JOIN follower ON user_id = following_user_id WHERE follower_user_id = (SELECT user_id FROM user WHERE username='${username}')`;
  const result = await db.all(query);
  response.send(result);
});

///API 5 Followers list
app.get("/user/followers/", authenticator, async (request, response) => {
  const { username } = request;
  const query = ` SELECT name FROM user WHERE user_id IN (SELECT follower_user_id FROM follower  WHERE following_user_id =(SELECT user_id FROM user WHERE username='${username}'))`;
  const result = await db.all(query);
  response.send(result);
});

///API 6 TWEET by ID
app.get("/tweets/:tweetId/", authenticator, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userFetchId = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}'`
  );
  const query = `SELECT * from tweet WHERE user_id IN ( SELECT following_user_id FROM follower WHERE follower_user_id = ${userFetchId.user_id}) AND tweet_id = ${tweetId};`;
  const result = await db.get(query);
  console.log(userFetchId.user_id, tweetId);
  console.log(result);
  if (result !== undefined) {
    // const tweetDetails = `SELECT tweet, count(DISTINCT like_id) as likes, count(DISTINCT reply_id) as replies, date_time as dateTime FROM tweet,like,reply WHERE
    //   tweet.tweet_id =${tweetId} AND like.tweet_id = ${tweetId} AND reply.tweet_id = ${tweetId}`;
    const tweetDetails = `SELECT tweet, count(DISTINCT like_id) as likes, count(DISTINCT reply_id) as replies, date_time as dateTime
     FROM tweet INNER JOIN like ON tweet.tweet_id=like.tweet_id
     INNER JOIN reply ON tweet.tweet_id = reply.tweet_id WHERE tweet.tweet_id=${tweetId}`;
    const result = await db.get(tweetDetails);
    response.send(result);
  } else {
    response.status(401).send("Invalid Request");
  }
});

///API 7 TWEET LIKES
app.get("/tweets/:tweetId/likes/", authenticator, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userFetchId = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}'`
  );
  const query = `SELECT * from tweet WHERE user_id IN (SELECT following_user_id FROM follower WHERE follower_user_id =${userFetchId.user_id}) AND tweet_id = ${tweetId}`;
  const result = await db.get(query);
  console.log(result);
  if (result !== undefined) {
    const tweetDetails = `SELECT username FROM user WHERE user_id IN ( SELECT user_id FROM like WHERE tweet_id = ${tweetId})`;
    const result = await db.all(tweetDetails);
    console.log(result);
    let array = [];
    for (const each in result) {
      let temp = result[each]["username"];
      array[each] = temp;
    }
    response.send({ likes: array });
  } else {
    response.status(401).send("Invalid Request");
  }
});

///API 8 TWEET REPLIES
app.get(
  "/tweets/:tweetId/replies/",
  authenticator,
  async (request, response) => {
    const { username } = request;
    const { tweetId } = request.params;
    const userFetchId = await db.get(
      `SELECT user_id FROM user WHERE username = '${username}'`
    );
    const query = `SELECT * FROM tweet WHERE user_id IN ( SELECT follower_user_id FROM follower WHERE following_user_id = ${userFetchId.user_id}) AND tweet_id = ${tweetId}`;
    const result = await db.get(query);
    console.log(result);
    if (result !== undefined) {
      const tweetDetails = `SELECT name,reply FROM user INNER JOIN reply ON user.user_id = reply.user_id WHERE reply.tweet_id = ${tweetId}`;
      const result = await db.all(tweetDetails);
      console.log(result);
      let array = [];
      for (const each in result) {
        let temp = result[each];
        array[each] = temp;
      }
      response.send({ replies: array });
    } else {
      response.status(401).send("Invalid Request");
    }
  }
);

///API 9 user's tweets
app.get("/user/tweets/", authenticator, async (request, response) => {
  const { username } = request;
  const userFetchId = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}'`
  );
  const query = `SELECT tweet, count(DISTINCT like_id) as likes, count(DISTINCT reply_id) as replies, date_time as dateTime FROM tweet,like,reply 
  WHERE tweet.tweet_id IN (SELECT tweet_id from tweet WHERE user_id =${userFetchId.user_id}) 
  AND like.tweet_id = tweet.tweet_id AND reply.tweet_id = tweet.tweet_id GROUP BY tweet.tweet_id`;
  const result = await db.all(query);
  response.send(result);
});

///API 10 CREATE TWEET
app.post("/user/tweets/", authenticator, async (request, response) => {
  const { username } = request;
  const { tweet } = request.body;
  const userFetchId = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}'`
  );
  const dateTime1 = new Date().toISOString();
  const date = dateTime1.slice(0, 10);
  const time = dateTime1.slice(11, 19);
  const dateTime = `${date} ${time}`;
  const query = `INSERT INTO tweet (tweet,user_id,date_time) VALUES ('${tweet}',${userFetchId.user_id},'${dateTime}') `;

  const result = await db.run(query);
  response.send("Created a Tweet");
});

/// API 11 DELETE OWN TWEET
app.delete("/tweets/:tweetId/", authenticator, async (request, response) => {
  const { username } = request;
  const { tweetId } = request.params;
  const userFetchId = await db.get(
    `SELECT user_id FROM user WHERE username = '${username}'`
  );
  console.log(userFetchId.user_id);
  const query = `SELECT * FROM tweet WHERE user_id = ${userFetchId.user_id} AND tweet_id = ${tweetId}`;
  const result = await db.get(query);
  console.log(result);
  if (result !== undefined) {
    const tweetDetails = ` DELETE FROM tweet WHERE tweet_id = ${tweetId}`;
    const result = await db.run(tweetDetails);
    console.log(result);
    response.send("Tweet Removed");
  } else {
    response.status(401).send("Invalid Request");
  }
});

module.exports = app;
