Hackers@Berkeley
=======

Hackers@Berkeley main website
Note: The hacks page and other infrastructure has been moved to habitat.hackersatberkeley.com
See https://github.com/HackBerkeley/habitat

Quick start
-----------

> git clone https://github.com/HackBerkeley/hackberkeley

> npm install

> node app.js

Deploying
---------

If you want to deploy, first make sure all your changes are pushed to Github
first. Please don't push changes to Heroku that are not pushed to Github; you
will be haunted for life if you do.

Once you've added the Heroku repo as a remote (say, `heroku`), deploy with

> git push origin master # push to github (make sure this succeeds)
> git push heroku master # deploy to heroku

Dependencies
------------

Install dependencies listed in package.json with
> npm install

If you need to add modules to the project, run
> npm install <package> --save

Run
---

Run the app with `node app.js`
if you want to run on a port different from the default value of 8086, use `node server.js default <port>` to specify the port number.

Work on a separate branch and push when you're confident in your changes.)
PUSH YOUR CHANGES TO GITHUB BEFORE PUSHING TO HEROKU

TODO
----

1. Refactor/rewrite all node API code
2. Follow next paging calls for group AND page events
