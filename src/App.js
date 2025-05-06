import React, { useEffect, useState } from 'react';
import mqtt from 'mqtt';
import './App.css';

const MQTT_BROKER = 'wss://0ff7825e0a6f400aac25c166b6bae304.s1.eu.hivemq.cloud:8884/mqtt';
const TOPIC_SUBSCRIBE = 'tank/level';
const TOPIC_PUBLISH = 'tankOperation';

function App() {
  const [messages, setMessages] = useState(() => {
    // Load the previously saved messages from localStorage (if any)
    const storedMessages = localStorage.getItem('mqttMessages');
    return storedMessages ? JSON.parse(storedMessages) : [];
  });
  const [client, setClient] = useState(null);
  const [turnOn, setTurnOn] = useState(true);
  const [usageDetails, setUsageDetails] = useState([0, 0, 0, 0, 0, 0]);
  const [peakTime, setPeakTime] = useState(false);
  const [waterLevel, setWaterLevel] = useState(0);
  const maxDist = 4.0;

  useEffect(() => {
    const options = {
      username: 'arduino',
      password: 'Arduino1',
      connectTimeout: 4000,
      clean: true,
    };

    const mqttClient = mqtt.connect(MQTT_BROKER, options);
    setClient(mqttClient);

    mqttClient.on('connect', () => {
      console.log('Connected to HiveMQ');
      mqttClient.subscribe(TOPIC_SUBSCRIBE);
    });

    mqttClient.on('message', (topic, message) => {
      const msg = message.toString();

      try {
        const parsed = JSON.parse(msg);
        const dist = parsed.distance - 2.23 || 'Invalid';
        const timestamp = parsed.timestamp || 'Unknown';
      
        const dateObj = new Date(timestamp.replace(' ', 'T')); // Convert to Date object
        const date = dateObj.toLocaleDateString('en-US', {
          year: '2-digit',
          month: 'short',
          day: 'numeric',
        });        
        const time = dateObj.toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
        }); // Format: HH:MM:SS AM/PM

        const seconds = parseInt(time.split(':')[2]);

        setUsageDetails(prev => {
          const updated = [...prev];     // Make a copy
          updated[seconds/10] += Math.min(250, dist);
          return updated;               // Set new state
        });

        let calculatedWaterLevel = dist < maxDist ? ((maxDist - dist) / maxDist) * 100 : 0;
        setWaterLevel(calculatedWaterLevel);
        
        // Save new message to state using the calculated value
        const newMessage = { 
          dist: dist, 
          waterLevel: calculatedWaterLevel.toFixed(2), 
          date: date,
          time: time
        };


        const updatedMessages = [newMessage, ...messages];

        // Update the state and store it in localStorage
        setMessages(updatedMessages);
        localStorage.setItem('mqttMessages', JSON.stringify(updatedMessages));

        const usgIdx = usageDetails.indexOf(Math.max(...usageDetails));
        if(usgIdx === ((seconds/10)+1)%6) {
          setPeakTime(true);
          if (mqttClient && turnOn) {
            mqttClient.publish(TOPIC_PUBLISH, "ON");
          }
          setTurnOn(false);
        } else {
          setPeakTime(false);
          if(dist < 0.9*maxDist) {
            if (mqttClient && !turnOn) {
              mqttClient.publish(TOPIC_PUBLISH, "OFF");
            }
            setTurnOn(true);
          } else if (dist > 0.2*maxDist) {
            if (mqttClient && turnOn) {
              mqttClient.publish(TOPIC_PUBLISH, "ON");
            }
            setTurnOn(false);
          }
        }

      } catch (e) {
        console.error('Invalid JSON:', msg);
      }
    });

    return () => {
      mqttClient.end();
    };
  }, [messages, usageDetails, turnOn, waterLevel]); // Dependency on `messages` to re-run the effect when state updates

  const sendCommand = () => {
    if (client) {
      client.publish(TOPIC_PUBLISH, turnOn ? "ON" : "OFF");
    }
    setTurnOn(!turnOn);
  };

  const clearMessages = () => {
    setMessages([]); 
    localStorage.removeItem('mqttMessages'); // Clear the stored messages in localStorage as well
  };

  return (
    <div className="app">
      <h1>Smart Tank Dashboard</h1>

      <div className="buttons">
        <h2>Motor Operations</h2>
        <button className={turnOn ? 'blue-btn' : 'red-btn'} onClick={() => sendCommand()}>{turnOn ? "Press to turn on" : "Press to turn off"}</button>
      </div>

      <button className='red-btn' onClick={clearMessages}>Clear All</button>
      <p>{peakTime ? "It is peak time" : "It is not peak time"}</p>
      <p><b>{"Motor status: "}</b>{(turnOn ? "Off" : "On") + (!turnOn ? (peakTime ? " (Due to peak usage hours)" : " (Due to low water level)"):"")}</p>
      <p><b>{"Max distance: "}</b> {maxDist}</p>

      <div className="table-container">
        <table>
          <thead>
            <tr>
              <th>Distance (cm)</th>
              <th>Water Level (%)</th>
              <th>Time</th>
              <th>Date</th>
            </tr>
          </thead>
          <tbody>
            {messages.map((msg, idx) => (
              <tr key={idx}>
                <td>{msg.dist}</td>
                <td>{msg.waterLevel + "%"}</td>
                <td>{msg.time}</td>
                <td>{msg.date}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p><b>Peak usage hours: </b> {"(displaying the peak usage in seconds for demonstration purposes)"}</p>
      <div className='percentages'>
        {usageDetails.map((val, index) => (
          <p><b>{index + "0: "}</b> {(usageDetails.reduce((sum, value) => sum + value, 0) > 0 ? ((val/usageDetails.reduce((sum, value) => sum + value, 0))*100).toFixed(2) : "0") + "%"}</p>
        ))}
      </div>
    </div>
  );
}

export default App;
