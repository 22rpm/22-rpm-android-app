import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Dimensions,
  Switch,
  StatusBar,
} from 'react-native';
import globalStyles from './globalStyles';
import { Modal, TextInput, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Linking } from 'react-native';

const { width, height } = Dimensions.get('window');

export default function Settings({ navigation }) {
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [showSupportModal, setShowSupportModal] = useState(false);
  const [supportEmail, setSupportEmail] = useState('ryan.mitchell@email.com'); // from profile
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    role: '',
    phoneNumber: '',
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchUserData = async () => {
    try {
      setIsLoading(true);

      const token = await AsyncStorage.getItem('token');

      if (!token) {
        navigation.navigate('Login');
        return;
      }

      const response = await fetch(
        'https://api.twentytwohealth.com/rpm-be/api/auth/check-me',
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          credentials: 'include',
        },
      );

      const responseText = await response.text();
      let data;

      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('Failed to parse JSON response:', parseError);
        return;
      }

      if (response.ok && data.ok) {
        const user = data.user;

        // Extract name parts
        const nameParts = user.name ? user.name.split(' ') : ['', ''];
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';

        // Update user data state
        setUserData({
          name: `${lastName}, ${firstName}`, // Format as "Mitchell, Ryan"
          email: user.email || '',
          role: user.role || 'Patient', // Assuming role is available in API response
          phoneNumber: user.phoneNumber || '',
        });

        // Also update support email with user's email
        setSupportEmail(user.email || '');
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // ADD useEffect to fetch data on component mount
  useEffect(() => {
    fetchUserData();
  }, []);

  const handleBack = () => {
    navigation.navigate('Home');
  };

  const settingsOptions = [
    {
      id: 'profile',
      title: 'Profile Settings',
      icon: require('./assets/profile-setting.png'),
      description: 'Your personal information',
      action: () => navigation.navigate('Profile'),
    },
    {
      id: 'notifications',
      title: 'Notifications',
      icon: require('./assets/notification.png'),
      description: 'Manage your notification preferences',
      hasSwitch: true,
      switchValue: notificationsEnabled,
      onSwitchChange: setNotificationsEnabled,
    },
    {
      id: 'privacy',
      title: 'Privacy Policy',
      icon: require('./assets/privacy-policy.png'),
      description: 'Control your data privacy settings',
      action: () => Linking.openURL('https://api.twentytwohealth.com/privacy'), // Create a new screen
    },
    {
      id: 'help',
      title: 'Help & Support',
      icon: require('./assets/help.png'),
      description: 'Get help and contact support',
      action: () => setShowSupportModal(true), // open modal
    },
    {
      id: 'about',
      title: 'About App',
      icon: require('./assets/information.png'),
      description: 'App version and information',
      value: 'v1.0',
      action: () => navigation.navigate('AboutApp'), // Create a new screen
    },
  ];

  return (
    <View style={styles.container}>
      <StatusBar
        backgroundColor={globalStyles.primaryColor.color}
        barStyle="light-content"
      />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Image
            source={require('./assets/icon_back.png')}
            style={styles.backIcon}
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      {/* Content */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Profile Card */}
        <View style={styles.profileCard}>
          <Image 
            source={require('./assets/avatar.png')} 
            style={styles.profileImage} 
          />
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>
              {isLoading ? 'Loading...' : userData.name || 'User Name'}
            </Text>
            <Text style={styles.userEmail}>
              {isLoading ? 'loading...' : userData.email || 'user@email.com'}
            </Text>
            {/* REPLACE ID WITH ROLE */}
            <Text style={styles.userId}>
              Role: {isLoading ? 'loading...' : userData.role || 'Patient'}
            </Text>
          </View>
        </View>

        {/* Settings Options */}
        <View style={styles.settingsSection}>
          <Text style={styles.sectionTitle}>Preferences</Text>
          {settingsOptions.map((item, index) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.optionCard,
                index === settingsOptions.length - 1 && styles.lastOptionCard,
              ]}
              onPress={item.action}
              activeOpacity={0.7}
            >
              <View style={styles.optionLeft}>
                <Image source={item.icon} style={styles.optionIcon} />
                <View style={styles.optionTextContainer}>
                  <Text style={styles.optionTitle}>{item.title}</Text>
                  <Text style={styles.optionDescription}>
                    {item.description}
                  </Text>
                </View>
              </View>

              <View style={styles.optionRight}>
                {item.value && (
                  <Text style={styles.optionValue}>{item.value}</Text>
                )}
                {item.hasSwitch ? (
                  <Switch
                    value={item.switchValue}
                    onValueChange={item.onSwitchChange}
                    trackColor={{
                      false: '#767577',
                      true: globalStyles.primaryColor.color,
                    }}
                    thumbColor={item.switchValue ? '#f4f3f4' : '#f4f3f4'}
                  />
                ) : (
                  <Image
                    source={require('./assets/back.png')}
                    style={styles.chevronIcon}
                  />
                )}
              </View>
            </TouchableOpacity>
          ))}
        </View>

        {/* App Version */}
        <View style={styles.versionContainer}>
          <Text style={styles.versionText}>
            22 Remote Patient Monitoring Services{' '}
          </Text>
          <Text style={styles.versionNumber}>Version 1.0 (Build 2101)</Text>
        </View>

        {/* Logout Button */}
        {/* <TouchableOpacity 
          style={styles.logoutButton}
          onPress={() => navigation.navigate('Login')}
        >
          <Text style={styles.logoutButtonText}>Log Out</Text>
        </TouchableOpacity> */}
      </ScrollView>

      <Modal
        transparent={true}
        visible={showSupportModal}
        animationType="slide"
        onRequestClose={() => setShowSupportModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <Text style={styles.modalTitle}>Contact Support</Text>

            {/* Email (read-only) */}
            <TextInput
              style={styles.input}
              value={supportEmail}
              editable={false}
            />

            {/* Subject */}
            <TextInput
              style={styles.input}
              placeholder="Subject (optional)"
              value={subject}
              onChangeText={setSubject}
            />

            {/* Message */}
            <TextInput
              style={[styles.input, styles.messageBox]}
              placeholder="Enter your message"
              value={message}
              onChangeText={setMessage}
              multiline
            />

            {/* Buttons */}
            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowSupportModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.sendButton}
                onPress={async () => {
                  if (!message.trim()) {
                    Alert.alert('Error', 'Message is required.');
                    return;
                  }

                  try {
                    // 🔹 Call backend API here to send email
                    // Example:
                    // await fetch("https://your-backend.com/send-support-email", {
                    //   method: "POST",
                    //   headers: { "Content-Type": "application/json" },
                    //   body: JSON.stringify({
                    //     to: "info@twentytwohealth.com",
                    //     from: supportEmail,
                    //     subject,
                    //     message
                    //   })
                    // });

                    Alert.alert('Success', 'Your message has been sent.');
                    setShowSupportModal(false);
                    setSubject('');
                    setMessage('');
                  } catch (error) {
                    Alert.alert('Error', 'Failed to send message.');
                  }
                }}
              >
                <Text style={styles.buttonText}>Send</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    width: '100%',
    height: height * 0.08,
    backgroundColor: globalStyles.primaryColor.color,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: width * 0.04,
    paddingTop: height * 0.01,
  },
  backButton: {
    padding: width * 0.02,
  },
  backIcon: {
    width: width * 0.06,
    height: width * 0.06,
    tintColor: '#fff',
  },
  headerTitle: {
    color: '#fff',
    fontSize: width * 0.05,
    fontWeight: 'bold',
  },
  headerRightPlaceholder: {
    width: width * 0.06,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: height * 0.05,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    marginHorizontal: width * 0.05,
    marginTop: height * 0.03,
    padding: width * 0.05,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  profileImage: {
    width: width * 0.15,
    height: width * 0.15,
    borderRadius: width * 0.075,
    marginRight: width * 0.04,
  },
  profileInfo: {
    flex: 1,
  },
  userName: {
    fontSize: width * 0.045,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: 4,
  },
  userEmail: {
    fontSize: width * 0.035,
    color: '#7f8c8d',
    marginBottom: 2,
  },
  userId: {
    fontSize: width * 0.03,
    color: '#95a5a6',
  },
  editButton: {
    backgroundColor: globalStyles.primaryColor.color,
    paddingHorizontal: width * 0.04,
    paddingVertical: height * 0.008,
    borderRadius: 20,
  },
  editButtonText: {
    color: '#fff',
    fontSize: width * 0.032,
    fontWeight: '600',
  },
  settingsSection: {
    marginTop: height * 0.03,
    marginHorizontal: width * 0.05,
  },
  sectionTitle: {
    fontSize: width * 0.04,
    fontWeight: 'bold',
    color: '#2c3e50',
    marginBottom: height * 0.02,
    paddingLeft: width * 0.02,
  },
  optionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    padding: width * 0.04,
    borderBottomWidth: 1,
    borderBottomColor: '#ecf0f1',
  },
  lastOptionCard: {
    borderBottomWidth: 0,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
  },
  optionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  optionIcon: {
    width: width * 0.06,
    height: width * 0.06,
    marginRight: width * 0.04,
    tintColor: '#014e6b',
  },
  optionTextContainer: {
    flex: 1,
  },
  optionTitle: {
    fontSize: width * 0.04,
    fontWeight: '600',
    color: '#2c3e50',
    marginBottom: 4,
  },
  optionDescription: {
    fontSize: width * 0.032,
    color: '#7f8c8d',
  },
  optionRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionValue: {
    fontSize: width * 0.035,
    color: '#7f8c8d',
    marginRight: width * 0.03,
  },
  chevronIcon: {
    width: width * 0.04,
    height: width * 0.04,
    tintColor: '#bdc3c7',
  },
  versionContainer: {
    alignItems: 'center',
    marginTop: height * 0.04,
    marginBottom: height * 0.02,
  },
  versionText: {
    fontSize: width * 0.038,
    color: '#7f8c8d',
    marginBottom: 4,
  },
  versionNumber: {
    fontSize: width * 0.032,
    color: '#bdc3c7',
  },
  logoutButton: {
    backgroundColor: '#e74c3c',
    marginHorizontal: width * 0.05,
    paddingVertical: height * 0.02,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: height * 0.02,
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: width * 0.04,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    width: width * 0.85,
    maxWidth: 400,
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: width * 0.05,
    elevation: 5,
  },
  modalTitle: {
    fontSize: width * 0.045,
    fontWeight: 'bold',
    marginBottom: height * 0.02,
    color: '#2c3e50',
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: width * 0.03,
    marginBottom: height * 0.015,
    fontSize: width * 0.035,
  },
  messageBox: {
    height: height * 0.12,
    textAlignVertical: 'top',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: height * 0.02,
  },
  cancelButton: {
    paddingVertical: height * 0.012,
    paddingHorizontal: width * 0.04,
    marginRight: width * 0.03,
    backgroundColor: '#bdc3c7',
    borderRadius: 8,
  },
  sendButton: {
    paddingVertical: height * 0.012,
    paddingHorizontal: width * 0.04,
    backgroundColor: globalStyles.primaryColor.color,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: width * 0.035,
  },
});
