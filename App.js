import 'react-native-gesture-handler';
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet } from 'react-native';
import globalStyles from './globalStyles';
import Login from './Login';
import Home from './Home';
import BloodPressure from './BloodPressure';
import IVPump from './IVPump';
import Oxygen from './Oxygen';
import Glucose from './Glucose';
import Temperature from './Temperature';
import Weight from './Weight';
import Profile from './Profile';
import Connection from './Connection';
import ECG from './ECG';
import  Settings  from './Settings';
import AboutAppScreen from './AboutAppScreen';
import PrivacySecurityScreen from './PrivacySecurityScreen';







export default function App() {
  const Stack = createStackNavigator();

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login" screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Login" component={Lowgin} />
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="BloodPressure" component={BloodPressure} />
        <Stack.Screen name="IVPump" component={IVPump} />
        <Stack.Screen name="Oxygen" component={Oxygen} />
        <Stack.Screen name="Glucose" component={Glucose} />
        <Stack.Screen name="Temperature" component={Temperature} />
        <Stack.Screen name="Weight" component={Weight} />
        <Stack.Screen name='Profile' component={Profile}/>
        <Stack.Screen name='Connection' component={Connection}/>
        <Stack.Screen name='ECG' component={ECG}/>
        <Stack.Screen name='Settings' component={Settings}/>
        <Stack.Screen name='AboutApp' component={AboutAppScreen}/>
        <Stack.Screen name='PrivacySecurity' component={PrivacySecurityScreen}/>
      </Stack.Navigator>
    </NavigationContainer>
  );
}
