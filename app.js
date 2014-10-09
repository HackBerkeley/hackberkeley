var express = require('express');
var fs = require('fs');
var app =  express.createServer();
var url = require('url');
var https = require('https');
var http = require('http');
var mongo = require('mongoskin');
var db = mongo.db('mongodb://hacker:berkeley@alex.mongohq.com:10018/hackberkeley');
var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

var projects;
var events;
var fbGroupCount = 0;

var HAB_GROUP_ID = '276905079008757';
// Access token is from Brian Chu's account, and expires after 60 days.
// Read more here: https://developers.facebook.com/docs/facebook-login/access-tokens/
// The access token MUST be a *user* access token (not an *app* or *page* access token).
// To regenerate the access token:
// 1. Go to https://developers.facebook.com/tools/explorer
// 2. Select any Facebook Application you are the admin of.
// 3. Generate an access token with 'user_groups' permission checked off.
// 4. The access token is a short-lived access token (expires in 1 hour)
// 5. Make this API call:
// https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=[app-id]&client_secret=[app-secret]&fb_exchange_token=[access-token]
// 6. The result is a long-term access token. Paste that in as ACCESS_TOKEN.
// An example is: https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=1530912480478591&client_secret=ee8bc6a26e59c385640238a72522931b&fb_exchange_token=[replace with graph explorer token]
var ACCESS_TOKEN = 'CAAVwW1aUxX8BAI2J1eB3UWFHwOj0piAniThP2FgzPivgzUKn7SnCLTjs6M0laVAybprZBhp4ZA94xIzAZBTLmZBQoa4bVBRfDEKOwv3EqUpGzP5k2RyRcvdjhRc0MZA0x5A2MzZBTLzmmCeZBLpMZAnxesD0Dd4M0RzeusvklhmZBER02YV1KuYfRaD99Lm97PWdas5jIfWvwTkmFKevPdAeO';

// sort comparators for unix timestamps
function asorterTimestamp(a, b) {
  return a - b;
}

function dsorterTimestamp(a, b) {
  return b - a;
}

// sort comparers for date strings
function asorter(a, b) {
  return getTime(a.start_time)-getTime(b.start_time);
}

function dsorter(a, b) {
  return getTime(b.start_time)-getTime(a.start_time);
}

function getTime(a) {
  return new Date(a).getTime();
}

function formatDate(date) {
  var d = date;
  var hh = d.getHours();
  var m = d.getMinutes();
  var s = d.getSeconds();
  var dd = "AM";
  var h = hh;
  if (h >= 12) {
      h = hh-12;
      dd = "PM";
  }
  if (h == 0) {
      h = 12;
  }
  m = m<10?"0"+m:m;

  if(m == '00') {
    return h + dd;
  }

  s = s<10?"0"+s:s;


  var pattern = new RegExp("0?"+hh+":"+m+":"+s);
  return h+":"+m+dd;
}

// This function is no longer used. It used to grab photos from each album, but Facebook no longer provides an API for getting FB group album photos.
function getPhotos(manyalbums) {
  for (var j in manyalbums) {
    var inline_function = function(i) {
      var a = manyalbums[i];
      var aid = a['id'];
      var currpic = photographs[aid]['photos'] = [];

      var photosPath = '/' + aid + '/photos?limit=200&access_token='+ACCESS_TOKEN;
      https.get({
        host: 'graph.facebook.com',
        path: photosPath
      }, function(res) {
          var body = "";
          res.on('data', function(chunk) {
          body += chunk;
        });
        res.on('end', function() {
          try {
            var data = JSON.parse(body);
            var pics = data['data'];
            a['icon'] = pics[0]['picture'];
            for (var j in pics) {
              var photo = {};
              photo['source'] = pics[j]['source'];
              currpic.push(photo);
            }
          } catch (error) {
            console.log(error.message);
          }
        });
      });
    }
    inline_function(j);
  }
}

// Get cover photos for each album
function getCoverPhotos(albums) {
  for (var i = 0; i < albums.length; i++) {
    var album = albums[i];
    if (!album.coverPhoto) { continue; }
    var coverPath = '/' + album.coverPhoto + '/?access_token='+ACCESS_TOKEN;
    https.get({
      host: 'graph.facebook.com',
      path: coverPath
    }, function(res) {
        var body = "";
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          var data = JSON.parse(body);
          album.icon = data.picture;
          album.source = data.source;
        } catch (error) {
          console.log(error.message);
        }
      });
    });
  }
}

function refreshCache () {
  db.collection('projects').find().sort({'order':1}).toArray(function(err, items){
      projects = items;
  });

  https.get({
    host: 'graph.facebook.com',
    path: '/' + HAB_GROUP_ID + '/albums?access_token=' + ACCESS_TOKEN
  }, function(res) {
      var body = "";
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          albums = [];
          photographs = {};
          var album;
          var data = JSON.parse(body);
          for (var i = 0; i < data.data.length ; i++) {
            album = data.data[i];
            var currentalbum = {
              name: album.name,
              id: album.id,
              coverPhoto: album.cover_pid,
              fbLink: album.link
            };
            albums.push(currentalbum);
          }
          getCoverPhotos(albums);
        } catch (error) {
          console.log(error.message);
        }
      });
  });


  // refresh list of events:
  https.get({
    host: 'graph.facebook.com',
    path: '/' + HAB_GROUP_ID + '/events?access_token=' + ACCESS_TOKEN
  }, function(res) {
    var body = "";
    res.on('data', function(chunk){
      body += chunk;
    });
    res.on('end', function(){
      try {
        var currentTime = (new Date()).valueOf();
        events = {'new': [], 'old': []};
        data = JSON.parse(body).data;

        var event, date;
        for(var i in data) {
          event = data[i];
          if(event.name !== undefined) {
            // gets a more detailed event object
            https.get({
              host: 'graph.facebook.com',
              path: 'https://graph.facebook.com/' + event.id + '?access_token=' + ACCESS_TOKEN
            }, function(res) {
              body = "",
              res.on('data', function(chunk){
                body += chunk;
              });
              res.on('end', function() {
                if(body == "false") {
                  return;
                }
                try {
                  event = JSON.parse(body);
                } catch(e) {
                  return;
                }
                date = new Date(event.start_time);
                event.date = months[date.getMonth()] + " " + date.getDate();
                event.dateObj = date;
                event.time = formatDate(date);
                if( event.description !== undefined ) {
                  event.description = event.description.split('\n').shift();
                }
                event.pic_url = "https://graph.facebook.com/" + event.id + "/picture?type=large";
                if(event.dateObj.valueOf() > currentTime) {
                  events['new'].push(event);
                } else {
                  events['old'].push(event);
                }

                // sorts the events every time. this may be ineffecient depending on what the sorting algorithm is and could be refactored
                events['new'].sort(asorter);
                events['old'].sort(dsorter);
              });
            });

          }
        }

      } catch (e){console.log(e.message);}
    });
  }); // end event list refresh

  // refresh count of facebook group members:
  var memberCountPaging = function(url) {
    https.get(url || {
      host: 'graph.facebook.com',
      path: '/' + HAB_GROUP_ID + '/members?access_token=' + ACCESS_TOKEN
    }, function(res) {
      var body = "";
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        if (!url) {
          fbGroupCount = 0;
        }
        try {
          body = JSON.parse(body);
          fbGroupCount += body.data.length;
          console.log('fbGroupCount:', fbGroupCount);
          if (body.paging && body.paging.next) {
            memberCountPaging(body.paging.next);
          }
        } catch (error) {
          console.log(error.message);
        }
      });
    });
  };
  memberCountPaging();

  setTimeout(refreshCache, 60000);
}

refreshCache();

// Initialize main server
app.use(express.bodyParser());

app.use(express.static(__dirname + '/public'));

app.set('view engine', 'ejs');
app.set('views', __dirname + '/views');

// For submitting hacks
app.post('/submit', function(req, res){
  url = req.body.demo;
  if (url && url.split(':').length < 2) {
    url = 'http://' + url	;
  }
  db.collection('hacks').insert({
    names: req.body.name,
    email: req.body.email,
    contact: req.body.contact,
    project_name: req.body.project_name,
    screenshot: req.body.screenshot,
    demo: url,
    hackathon: 'hack',
    date: new Date()
  }, function(error, docs) {
    res.redirect('/hack/hack');
  });
});

app.get('/', function(req, res){
  res.render('home', {page: 'home', events: events, fbGroupCount: fbGroupCount});
});

app.get('/home', function(req, res){
  res.render('home', {page: 'home', events: events, fbGroupCount: fbGroupCount});
});

app.get('/sponsors', function(req, res){
  res.render('sponsors', {page: 'sponsors'});
});


app.get('/events', function(req, res){
  res.render('events', {page: 'events', events: events});
});

app.get('/people', function(req, res){
  res.render('people', {page: 'people'});
});

app.get('/media', function(req, res){
  res.render('media', {page: 'media', albums: albums});
});

app.get('/submit', function(req, res){
  res.render('hackjam', {page: 'hack'});
});

// deprecated and unused, since album photos are inaccessible via FB Graph API:
app.get('/media/:id', function(req, res){
  var pid = req.params.id;
  var p = photographs[pid];
  if (p !== undefined) {
    res.render('photos', {page: 'media', current: p});
  } else {
    res.redirect('/media');
  }
});

app.get('/present', function(req, res) {
  db.collection('hacks').find({ hackathon: 'hack' }).toArray(function(err, presentations) {
    res.render('present', { page: 'media', presentations: presentations.slice(9) });
  });
});

app.get('/hack/:hackathon', function(req, res) {
  db.collection('hacks').find({'hackathon': req.params.hackathon}).toArray(function(err, hacks) {
    if (hacks.length === 0 || err) {
      res.redirect('/');
    } else {
      res.render('hack', {layout: false, hacks: hacks});
    }
  });
});

app.get('/payments', function(req, res){
  //empty for now...
  res.render('payments',{page: 'payments'});
});

app.listen(process.env.PORT || 8086);
