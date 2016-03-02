var fs = require('fs'),
    http = require('http'),
    https = require('https'),
    fs = require('fs'),

    socketio = require('socket.io'),
    mysql  = require('mysql'),
    express = require('express'),
    chalk = require('chalk'),
    app = express(),
    server,
	  connection = mysql.createConnection({
		  host     : 'localhost',
		  user     : 'root',
		  password : '',
		  port     : 3306,
		  database : "ipostmo_notifications",
		  multipleStatements: true
	   });

app.disable('x-powered-by');
app.use(function (req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
next();
});

app.get('*', function (req, res) {
  res.write("Im ALive and Kicking...")
});

server = http.createServer(app);
server = http.createServer(function(req, res) {
	res.writeHead(200, { 'Content-type': 'text/html'});
}).listen(4000, function() {
		console.log('Listening at http: port:4000');
});

var io = socketio.listen(server);

io.on('connection', function (socket) {
	var CURRENT_ROOM =   0;

	socket.on('join-room', function (roomId) {
    socket.join(roomId);
    CURRENT_ROOM = roomId;
    console.log(chalk.green('You have successfully joined a room. %s'), roomId);
  });

  socket.on("countUnreadMessages", function(data){
    countUnreadMessages();
  });

  socket.on('test', function (msg) {
      console.log('Message Received: ', msg);
      socket.broadcast.to(CURRENT_ROOM).emit('test', msg);
  });

  /* ===============================
  / MESSAGING
  / when a recipient sends a message
  /  ===============================
  */
	socket.on("sendMessage", function (data) {
    console.log(chalk.yellow("sendMessage:received < %s data: < %s"), CURRENT_ROOM, JSON.stringify(data));
		var sender = CURRENT_ROOM;
		var message = {
			sender: sender,
			recipient: data.recipient,
			message: data.message,
			date: new Date(),
			read: 1
		}

    console.log("sendMessage:sent > " + JSON.stringify(message));
		connection.query('select * from message_tagger having combined_user_id = concat(?, "_", ?) or combined_user_id = concat(?, "_", ?)', [sender, data.recipient, data.recipient, sender], function (_error, _result) {
    if(_result){
		  if (_result.length == 0) {
				connection.query('insert into message_tagger set ?', {combined_user_id: sender + "_" + data.recipient , mt_sender: sender, mt_recipient: data.recipient}, function (__error, __result) {
				  message.message_tagger = __result.insertId;
					connection.query('insert into messages set ?', message, function (error, result) {
            connection.query('select m.*, m.message as  message, m.date as date, concat(recipient.fullname) as recipient_fullname, concat(sender.fullname) as sender_fullname from messages m left join users recipient on recipient.id = m.recipient left join users sender on sender.id = m.sender where m.id = ? limit 1', __result.insertId, function (m_error, m_result) {
              if(m_result){
                console.log(chalk.green("sendMessage:success = %s"), m_result[0]);
                socket.emit('loadNewMessage_' + sender, m_result[0]);
  							io.emit('loadNewMessage_' + data.recipient, m_result[0]);
                countUnreadMessages();
              }else{
                console.log(chalk.red("sendMessage:error = %s"), m_error);
              }
		        });
          });

					connection.query('update message_tagger set `last_seen_date` = ? where id = ?', [(new Date()), message.message_tagger  ], function (_error, _result) {

          });
			  });
			}else{
				message.message_tagger = _result[0].id;
				connection.query('insert into messages set ?', message, function (error, result) {
          socket.emit('loadNewMessage_' + sender, message);
          io.emit('loadNewMessage_' + data.recipient, message);
          countUnreadMessages();
				});
				connection.query('update message_tagger set `last_seen_date` = ? where id = ?', [(new Date()), message.message_tagger  ], function (_error, _result) {

        });
      }
    }else{
      console.log(chalk.red("sendMessage:error < %s "), _error);
    }
		});
	});


  /* ===============================
  / MESSAGING
  / counting unread messages
  /  ===============================
  */
  function countUnreadMessages () {
    console.log(chalk.yellow("countUnreadMessages: {no paramater} "));
    var sender = CURRENT_ROOM;
    connection.query("select sum(m.read) as unread_count from messages m where recipient = ? and read = 0 limit 1", [sender], function (error, result) {
     if (result == null) {
       console.log("countUnreadMessages: 0");
       socket.emit('showUnreadMessages_' + sender, 0);
     }else{
       console.log("countUnreadMessages: ", result[0].unread_count);
       socket.emit('showUnreadMessages_' + sender, result[0].unread_count);
     }
    });
  }

  /* ===============================
  / MESSAGING
  / retrieve all conversation of users to his/her recipient
  /  ===============================
  */
  socket.on("loadUserConversations" , function (data) {
    console.log(chalk.yellow("loadUserConversations: < %s"), JSON.stringify(data));
  	var sender = CURRENT_ROOM;
  		start = data.start;
  		limit = data.limit;
  		connection.query("select mt.id as id,mt.last_seen_date as date, mt.combined_user_id, mt_sender, mt_recipient, recipient.fullname as recipient, sender.fullname sender from message_tagger as mt left join users sender on sender.id = mt.mt_sender left join users recipient on recipient.id = mt.mt_recipient where mt.combined_user_id like '%" + sender + "%' order by last_seen_date limit ?,?", [start, limit], function (error, result) {
        console.log("result: ", result);
        if(result){
          socket.emit('loadUserConversations_' + sender, result);
        }else{
          console.log(chalk.red("loadUserConversations:error: ", result));
          console.log(chalk.red("loadUserConversations:error: ", sender));
        }
  		});
  });

  /* ===============================
  / MESSAGING
  / retrieve conversation by recipient
  /  ===============================
  */
	socket.on("loadConversation" , function (data) {
    console.log(chalk.yellow("loadConversation: < %s"), JSON.stringify(data));
		var sender = CURRENT_ROOM;
			recipient = data.recipient;
			start = data.start;
			limit = data.limit;
			connection.query('select * from message_tagger having combined_user_id = concat(?, "_", ?) or combined_user_id = concat(?, "_", ?) limit 1', [sender, data.recipient, data.recipient, sender], function (_error, _result) {
				if(_result.length > 0){
					var message_tagger = _result[0].id;

					connection.query("select m.* from messages m where message_tagger = ? order by id asc limit ?, ?", [message_tagger, start, limit], function (error, result) {
						//console.log(this.sql);
						socket.emit('loadConversation_' + sender, result);
					});

					connection.query('update messages m set m.read = 0 where where message_tagger = ?', [message_tagger] , function (error, result) {
						console.log("ALL MESSAGES ARE NOW READ....");
					});
				}
			});
	});

  /* ===============================
  / NOTIFICATION
  / saving notifications
  /  ===============================
  */
  socket.on('notify', function (userNotif) {
  	 processNotification(userNotif);
  });

  /* ===============================
  / NOTIFICATION
  / notify subscriber
  /  ===============================
  */
  socket.on('notifySubscribers', function (userNotif) {
  	var notifMessage = {
    	message: userNotif.message,
    	type: userNotif.type,
    	created_at: new Date()
    };
		connection.query('insert into notification_messages set ?', notifMessage, function (error, result) {
			console.log(JSON.stringify(result));
			connection.query('select distinct(subscriber_id) from subscribers where user_id = ?', [userNotif.user_id], function (subscriberError, subscriberResult) {
       console.log("DISTINCT USERS-->>  " + JSON.stringify(subscriberResult) );
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

  /* ===============================
  / NOTIFICATION
  / count notifications.
  /  ===============================
  */
	socket.on('countNotification', function (notif) {
    console.log(chalk.yellow('countNotification %s'), JSON.stringify(notif));
		connection.query('select count(1) as count from notifications where `user_id` = ? and `viewed` = ? limit 1', [notif.user_id, notif.viewed], function (error, result) {
      if(result){
        console.log("countNotification: ", result[0].count);
        socket.emit("showTotalNotification", result[0].count);
      }else{
        console.log("countNotification: 0");
        socket.emit("showTotalNotification", 0);
      }
		});
  });

  /* ===============================
  / NOTIFICATION
  / View per notifications per user
  /  ===============================
  */
	socket.on('viewUserNotifications', function (notif) {
		connection.query('select notif.id, username, fullname, notif_message.created_at, notif.user_id, notified_by, type, message, viewed from notifications notif left join notification_messages notif_message on notif_message.id = notif.notification_message_id left join users u on u.id = notif.user_id where notif.user_id = ? order by notif.id asc limit ?, ? ', [notif.user_id, notif.record_start, notif.number_of_records], function (error, result) {
			socket.emit("showNotificationList", JSON.stringify(result));
      connection.query('UPDATE `notifications` SET `viewed` = 0  and `user_id` = ?', [ CURRENT_ROOM] , function (errorInNotif, notifUpdateResult) {
        notif.viewed = 1;
        console.log("something.... update called...." + this.sql);
        connection.query('select count(1) as count from notifications where `user_id` = ? and `viewed` = ? limit 1', [CURRENT_ROOM, notif.viewed], function (error, result) {
          console.log("SOCKET.EMIT..." + result[0].count );
          socket.emit("showTotalNotification", result[0].count);
        });
      });
		});
	 });

   /* ===============================
   / NOTIFICATION
   / View per notification Id and User ID
   /  ===============================
   */
	socket.on('viewNotification', function (notif) {
		connection.query('select notif.id, username, fullname, notif_message.created_at, notif.user_id, notified_by, type, message, viewed from notifications notif left join notification_messages notif_message on notif_message.id = notif.notification_message_id left join users u on u.id = notif.user_id  where notif.user_id = ? and notif.id = ?', [notif.user_id, notif.id], function (error, result) {
			var isValid = false;
			var notifLink = "";
			if (error || result.length == 0) {
			}else{
        isValid = true;
				notifLink = "/";
				connection.query('UPDATE `notifications` SET `viewed` = 0 where `id` = ? and `user_id` = ?', [notif.id, notif.user_id] , function (errorInNotif, notifUpdateResult) {
					notif.viewed = 1;
          connection.query('select count(1) as count from notifications where `user_id` = ? and `viewed` = ? limit 1', [notif.user_id, notif.viewed], function (error, result) {
            socket.emit("showTotalNotification", result[0].count);
          });
				});
			}
			socket.emit("viewNotification", {valid: isValid, link: notifLink, notification: result});
		});
	 });

   /* ===============================
   / SUBSCRIBERS
   / Saving of subscribers
   /  ===============================
   */
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
				  io.in(CURRENT_ROOM).emit("subscribeResult", {message : "failed"});
			}
		});
	});

  /* ===============================
  / USER
  / Save New Users
  /  ===============================
  */
	socket.on('saveNewUser', function (data) {
		connection.query('insert into `users` set ?', data, function (error, result) { });
	});

  /* ===============================
  / USER
  / Update Users
  /  ===============================
  */
	socket.on('updateUser', function (data) {
		connection.query('UPDATE `users` SET `username` = "'+ data.username +'", `fullname` = "'+ data.fullname +'" WHERE `id` = "' + data.id + '"', function (error, result) { });
	});

  /* ===============================
  / NOTIFICATION
  / Process Notifications
  /  ===============================
  */
	function processNotification(userNotif){
		var notifMessage = {
			message: userNotif.message,
			type: userNotif.type,
			created_at: new Date()
		};
		connection.query('insert into notification_messages set ?', notifMessage, function (error, result) {
			var notification = {
				user_id: userNotif.user_id,
				notified_by: userNotif.notified_by,
				notification_message_id : result.insertId,
				created_at: new Date()
			}
			saveNotification(notification);
		});
	}

  /* ===============================
  / NOTIFICATION
  / Save Notifications
  /  ===============================
  */
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
