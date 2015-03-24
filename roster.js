var fs = require('fs');
var _ = require('lodash');

var people = [
  {
    name: 'Brian Chu',
    link: 'https://www.brianchu.com'
  },
  'Kevin Chen',
  'Bob Zhou',
  'Daylen Yang',
  'Lily Nguyen',
  'David Bui',
  'Larry Xu',
  'Alex Yang',
  'Smitha Milli',
  'Apollo Jain',
  'Mitchell Karchemsky',
  'Rodney Folz',
  'Michelle Chang',
  'Melanie Cebula',
  'Stephanie Djidjev',
  'Justin Comins',
  'Dennis Zhao',
  'Andy Wang',
  'Ravi Tadinada',
  'Nathan Mandi',
  'Sumukh Sridhara',
  'Sidd Karamcheti',
];

// set image filenames:
var extensions = ['.jpg', '.png'];
var imageRoot = './public/images/people/';
for (var i = 0; i < people.length; i++) {
  var person = people[i];

  // convert <string> to object with name: <string>
  if (typeof person === 'string') {
    person = people[i] = {
      name: person
    };
  }

  var imageFilename = person.name.toLowerCase().split(' ').join('-');
  var ext = null;

  for (var j = 0; j < extensions.length; j++) {
    var e = extensions[j];
    try {
      fs.openSync(imageRoot + imageFilename + e, 'r')
      ext = e;
      break;
    }
    catch (err) {}
  }

  person.img = ext ? imageFilename + ext : 'default.png';
}

module.exports.getPeople = function() {
  return _.shuffle(people);
};