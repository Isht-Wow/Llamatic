#!/bin/bash
# Start the server in the background, redirecting stdout and stderr to Llamatic.log
nohup node server.js > Llamatic.log 2>&1 &
echo "Llamatic started with PID $!"
echo "Logs are being written to Llamatic.log"
