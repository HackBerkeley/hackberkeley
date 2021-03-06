var express = require('express');
var fs = require('fs');
var app =  express.createServer();
var _ = require('lodash');
var url = require('url');
var https = require('https');
var http = require('http');
var mongo = require('mongoskin');
var db = mongo.db('mongodb://hacker:berkeley@alex.mongohq.com:10018/hackberkeley');
var months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
var redirects = require('./redirects');

var projects;
var events = {'new': [], 'old': []};
var albums = [];
var fbGroupCount = 0;

var HAB_GROUP_ID = '276905079008757';
var HAB_PAGE_ID = '157417191056406';
// Access token is from Brian Chu's account, and expires after 60 days.
// Read more here: https://developers.facebook.com/docs/facebook-login/access-tokens/
// The access token MUST be a *user* access token (not an *app* or *page* access token).
// To regenerate the access token:
// 1. Go to https://developers.facebook.com/tools/explorer
// 2. Select any Facebook Application you are the admin of.
// 3. Generate an access token with 'user_groups' permission checked on.
// 4. The access token is a short-lived access token (expires in 1 hour)
// 5. Make this API call:
// https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=[app-id]&client_secret=[app-secret]&fb_exchange_token=[access-token]
// 6. The result is a long-term access token. Paste that in as ACCESS_TOKEN.
// An example is (for Brian's Hackers at Berkeley FB app): https://graph.facebook.com/oauth/access_token?grant_type=fb_exchange_token&client_id=1530912480478591&client_secret=ee8bc6a26e59c385640238a72522931b&fb_exchange_token=[replace with graph explorer token]
var ACCESS_TOKEN = 'CAAD3shybXjYBAN8kT4ZCY9MsHZCPY5yJKj5QrYG6JeNfOYlji6abnE3jhFlRowxgA7DacB55Quixuy326kxEqr4CbOuwz9vlI0PG8ZAdZCsciHBvrW976A3AMcjZBJ8uutd7yUOPG22iHX7vdkF7zI0bScp0ikRByeZCqMtj5FXUWnak5QGQtgsBZBdDNI8vfuT7QrCmwQ00ZB2HSQmiAKkd';

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

// Get cover photos for each album (Facebook's API does not seem to work here)
function getCoverPhotos(albums) {
  for (var i = 0; i < albums.length; i++) {
    var album = albums[i];
    if (!album.id) { continue; }

    var albumPath = '/' + album.id + '/?access_token='+ACCESS_TOKEN;
    var getObj = https.get({
      host: 'graph.facebook.com',
      path: albumPath
    }, function(res) {
        var body = "";
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          var data = JSON.parse(body);
          var coverPhotoId = data.cover_photo
        } catch (err) {
          console.log('Cover photos:', err.message);
        }
      });
    });
    errorNoOp(getObj);
  }
}

// passed a list of events, data
function updateEvents (data) {
  try {
    var currentTime = (new Date()).valueOf();
    updatedEvents = {'new': [], 'old': []};

    var event, date;
    for(var i = 0 ; i < data.length; i++) {
      event = data[i];
      if (event.name == undefined) { continue; }
      try {
        // gets a more detailed event object
        var getObj = https.get({
          host: 'graph.facebook.com',
          path: 'https://graph.facebook.com/' + event.id + '?access_token=' + ACCESS_TOKEN
        }, function(res) {
          res.setEncoding('utf8');
          var body = "";
          res.on('data', function(chunk){
            body += chunk;
          });
          res.on('end', function() {
            if(body == "false") {
              return;
            }
            event = JSON.parse(body);
            date = new Date(event.start_time);
            event.date = months[date.getMonth()] + " " + date.getDate();
            event.dateObj = date;
            event.time = formatDate(date);
            if( event.description !== undefined ) {
              event.description = event.description.split('\n').shift();
            }
            event.pic_url = "https://graph.facebook.com/" + event.id + "/picture?type=large";
            if(event.dateObj.valueOf() > currentTime) {
              updatedEvents.new.push(event);
            } else {
              updatedEvents.old.push(event);
            }

            // sorts the updatedEvents every time. this may be ineffecient depending on what the sorting algorithm is and could be refactored
            updatedEvents.new.sort(asorter);
            updatedEvents.old.sort(dsorter);
            if (updatedEvents.new.length + updatedEvents.old.length >= events.new.length + events.old.length) {
              events = updatedEvents;
            }
          });
        }); // end https.get
        errorNoOp(getObj);
      } // end try
      catch(err) {
        console.log('Single event:', err.message)
        return;
      }

    }

  } catch (err) {
    console.log('updateEvents:', err.message);
  }
}

function errorNoOp(req) {
  req.on('error', function() {});
}

function refreshCache () {
  console.log('Start refresh cache');
  db.collection('projects').find().sort({'order':1}).toArray(function(err, items){
      projects = items;
  });
  var getObj = https.get({
    host: 'graph.facebook.com',
    path: '/' + HAB_GROUP_ID + '/albums?access_token=' + ACCESS_TOKEN
  }, function(res) {
      var body = "";
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          var newAlbums = [];
          photographs = {};
          var album;
          var data = JSON.parse(body);
          if (!data.data) {
            return;
          }
          for (var i = 0; i < data.data.length ; i++) {
            album = data.data[i];
            var currentalbum = {
              name: album.name,
              id: album.id,
              fbLink: album.link
            };
            newAlbums.push(currentalbum);
          }
          if (newAlbums.length > 0) {
            albums = newAlbums;
          }
          getCoverPhotos(albums);
        } catch (err) {
          console.log('Albums:', err.message);
        }
      });
  });
errorNoOp(getObj);


  // refresh list of events:
  var getObj = https.get({
    host: 'graph.facebook.com',
    path: '/' + HAB_GROUP_ID + '/events?access_token=' + ACCESS_TOKEN
  }, function(res) {
    var body = "";
    res.on('data', function(chunk){
      body += chunk;
    });
    res.on('end', function(){
      try {
        data = JSON.parse(body).data || []
      } catch (err) { console.log('Events parse:', err.message); }

      // get UPCOMING events from Facebook page (not past events)
      var getObj = https.get({
        host: 'graph.facebook.com',
        path: '/' + HAB_PAGE_ID + '/events?access_token=' + ACCESS_TOKEN
      }, function(res) {
        var body = "";
        res.on('data', function(chunk){
          body += chunk;
        });
        res.on('end', function(){
          try {
            data = data.concat(JSON.parse(body).data || []);
            updateEvents(data);
          } catch (err) {'Subsequent events parse:', console.log(err.message); }
        });
      }); // end nested event list refresh
      errorNoOp(getObj);
    });
  }); // end event list refresh
  errorNoOp(getObj);

  // refresh count of facebook group members:
  var newFbGroupCount = 0;
  var memberCountPaging = function(url) {
    var getObj = https.get(url || {
      host: 'graph.facebook.com',
      path: '/' + HAB_GROUP_ID + '/members?access_token=' + ACCESS_TOKEN
    }, function(res) {
      var body = "";
      res.on('data', function(chunk) {
        body += chunk;
      });
      res.on('end', function() {
        try {
          body = JSON.parse(body);
          if (!body.data) {
            return;
          }
          newFbGroupCount += body.data.length;
          console.log('newFbGroupCount:', newFbGroupCount);
          if (body.paging && body.paging.next) {
            memberCountPaging(body.paging.next);
          }
          // no more pages
          else {
            // don't overwrite with lower value
            fbGroupCount = Math.max(newFbGroupCount, fbGroupCount);
          }

        } catch (err) {
          console.log('Member count:', err.message);
        }
      });
    });
    errorNoOp(getObj);
  };
  memberCountPaging();

  // 5 minutes
  setTimeout(refreshCache, 5 * 60000);
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
  }, function(err, docs) {
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

var roster = require('./roster.js');
app.get('/people', function(req, res){
  res.render('people', { page: 'people', people: roster.getPeople() });
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

app.get('/chat', function(req, res) {
  console.log(res.redirect.toString());
  res.redirect('http://chat.hackersatberkeley.com', 301);
});

redirects(app);

app.listen(process.env.PORT || 8086);
