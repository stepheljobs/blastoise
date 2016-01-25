var fs = require('fs')
    , http = require('http')
    , socketio = require('socket.io')
    , mysql  = require('mysql')
	, connection = mysql.createConnection({
		  host     : 'localhost',
		  user     : 'root',
		  password : '',
		  port     : 3306,
		  database : "ipostmo_notifications",
		  multipleStatements: true
	   });

var server = http.createServer(function(req, res) {
    res.writeHead(200, { 'Content-type': 'text/html'});
    //res.end(fs.readFileSync(__dirname + '/index.html'));
    res.write("ddddd")
}).listen(8080, function() {
    console.log('Listening at: port:8080');
});

var io = socketio.listen(server);
io.on('connection', function (socket) {
	var CURRENT_ROOM =   0;

	socket.on('join-room', function (roomId) {
        socket.join(roomId);
        CURRENT_ROOM = roomId;
        console.log("You have successfully joined a room." + roomId);
    });
    socket.on('test', function (msg) {
        console.log('Message Received: ', msg);
        socket.broadcast.to(CURRENT_ROOM).emit('test', msg);

    });



    //SAVING OF NOTIICATION
    socket.on('notify', function (userNotif) {
    	 processNotification(userNotif);
	});

	//NOTIFY SUBSCRIBERS
    socket.on('notifySubscribers', function (userNotif) {
    	var notifMessage = {
			message: userNotif.message,
			type: userNotif.type,
			created_at: new Date()
		};
		connection.query('insert into notification_messages set ?', notifMessage, function (error, result) {
			console.log(JSON.stringify(result));
			connection.query('select distinct(subscriber_id) from subscribers where user_id = ? and user_id != 0', [userNotif.user_id], function (subscriberError, subscriberResult) {				
				for(var i = 0; i < subscriberResult.length; i++){
					var subscriberNotif = {
						user_id: subscriberResult[i].subscriber_id,
						notified_by: userNotif.user_id,
						notification_message_id: result.insertId
					}
					saveNotification(subscriberNotif);
				}
			});

		});
	});

    //##COUNT NOTIFICATION
	//required data: user_id, viewed
	socket.on('countNotification', function (notif) {
		connection.query('select count(1) as count from notifications where `user_id` = ? and `viewed` = ? limit 1', [notif.user_id, notif.viewed], function (error, result) {
			socket.emit("showTotalNotification", result[0].count);
		});
    });

	//##VIEW PER NOTIFICATIONS PER USER
	//required data: user_id
	socket.on('viewUserNotifications', function (notif) {
		connection.query('select notif.id, username, fullname, notif_message.created_at, notif.user_id, notified_by, type, message, viewed from notifications notif left join notification_messages notif_message on notif_message.id = notif.notification_message_id left join users u on u.id = notif.user_id where notif.user_id = ? order by notif.id asc limit ?, ? ', [notif.user_id, notif.record_start, notif.number_of_records], function (error, result) {
			//console.log("SQL:::: " + this.sql);
			socket.emit("showNotificationList", JSON.stringify(result));
		});
	 });

	//##VIEW PER NOTIFICATION ID AND USER ID
	//required data: id(notification) ,user_id
	socket.on('viewNotification', function (notif) {
		connection.query('select notif.id, username, fullname, notif_message.created_at, notif.user_id, notified_by, type, message, viewed from notifications notif left join notification_messages notif_message on notif_message.id = notif.notification_message_id left join users u on u.id = notif.user_id  where notif.user_id = ? and notif.id = ?', [notif.user_id, notif.id], function (error, result) {
			var isValid = false;
			var notifLink = "";
			if(error || result.length == 0){

			}else{
				isValid = true;
				notifLink = "/";
			}
			socket.emit("viewNotification", {valid: isValid, link: notifLink, notification: result});
			
		});
	 });

	//##SUBSCRIBERS
	//id, user_id, subscriber_id, status, created_at


	//SAVING OF SUBSCRIBERS
	//required data:  user_id, subscriber_id
	socket.on('subscribe', function (data) {

		var subscriber = {
			user_id: data.user_id,
			subscriber_id: data.subscriber_id,
			status : 1,
			subscribe_date : new Date()

		};
		connection.query('select count(1) as count from subscribers where user_id = ? and subscriber_id = ?', [subscriber.user_id, subscriber.subscriber_id], function (_error, _result) {
			if(_result[0].count == 0){
				connection.query('insert into subscribers set ?', subscriber, function (error, result) {
					// socket.broadcast.to(CURRENT_ROOM).emit("subscribeResult", "success");

				 	io.in(CURRENT_ROOM).emit("subscribeResult", {message : "success"});
					var subscriberNotif = {
						user_id: subscriber.user_id,
						notified_by: subscriber.subscriber_id,
						notification_message_id: result.insertId,
						message: data.message,
						type: "SUBS",
					}
					 processNotification(subscriberNotif);
				});
			}else{
				// socket.broadcast.to(CURRENT_ROOM).emit("subscribeResult", {message : "failed"});
				  io.in(CURRENT_ROOM).emit("subscribeResult", {message : "failed"});
			}
		});

	});



	socket.on('saveNewUser', function (data) {
		connection.query('insert into `users` set ?', data, function (error, result) {

		});
	});

	socket.on('updateUser', function (data) {
		connection.query('UPDATE `users` SET `username` = "'+ data.username +'", `fullname` = "'+ data.fullname +'" WHERE `id` = "' + data.id + '"', function (error, result) {   

		});
	});

	//REPEATED FUNCTIONS

	function processNotification(userNotif){
		var notifMessage = {
			message: userNotif.message,
			type: userNotif.type,
			created_at: new Date()
		};
		connection.query('insert into notification_messages set ?', notifMessage, function (error, result) {
			//if(!error){
					//NOTIFY ONE NOTIFICATION
					var notification = {
						user_id: userNotif.user_id,
						notified_by: userNotif.notified_by,
						notification_message_id : result.insertId,
						created_at: new Date()
					}
					saveNotification(notification);
			//}
		});
	}


	function saveNotification(userNotif){
		userNotif["last_viewed_at"] = new Date();
		userNotif["created_at"] = new Date();
		connection.query('insert into notifications set ?', userNotif , function (error, result) {
			
			connection.query('select notif.id, username, fullname, notif_message.created_at, notif.user_id, notified_by, type, message, viewed from notifications notif left join notification_messages notif_message on notif_message.id = notif.notification_message_id left join users u on u.id = notif.user_id  where notif.user_id = ? and notif.id = ?', [userNotif.user_id, result.insertId], function (_error, newlyInsertedNotification) {
				io.emit("processNewNotifications", newlyInsertedNotification);
				//socket.emit("viewNotification", {valid: isValid, link: notifLink, notification: result});
			});
		});
	}

});




