var express = require('express');
var fs = require('fs');
var app =  express.createServer();
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
var ACCESS_TOKEN = 'CAAVwW1aUxX8BAMbpp5pZAZCuZCdnQJMikBtZBnlYcqZBRalEeFXYa6f1P6JWgDeJLaxoB9bzddHYfEzS8ZAOCunnG0Xx8ZAYkpXeidh7lcZBfXEKIqx49629QG1U6EnRieQAp9rZAQ688PzlBYP3waZCTbZBgDv0KWZA4r46lCPoDzcvHo7KLS6OQq3U6LewXdimyp7q38v9PYi0T2ZB4ptomQqzp';

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
          } catch (err) {
            console.log('Photos:', err.message);
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
        } catch (err) {
          console.log('Cover photos:', err.message);
        }
      });
    });
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
      if (event.name !== undefined) {
        // gets a more detailed event object
        https.get({
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
            try {
              event = JSON.parse(body);
            } catch(err) {
              console.log('Single event:', err.message)
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
        });

      }
    }

  } catch (err) {
    console.log('updateEvents:', err.message);
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
              coverPhoto: album.cover_pid,
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
        data = JSON.parse(body).data || []
      } catch (err) { console.log('Events parse:', err.message); }

      https.get({
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
    });
  }); // end event list refresh

  // refresh count of facebook group members:
  var newFbGroupCount = 0;
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

app.get('/chat', function(req, res) {
  console.log(res.redirect.toString());
  res.redirect('http://chat.hackersatberkeley.com', 301);
});

redirects(app);

app.listen(process.env.PORT || 8086);
