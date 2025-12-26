// PrivacySecurityScreen.js
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Linking,
    Dimensions,
    Image,
  Alert
} from 'react-native';
import globalStyles from './globalStyles';

const { width, height } = Dimensions.get('window');

export default function PrivacySecurityScreen({ navigation }) {
  const [biometricEnabled, setBiometricEnabled] = useState(true);
  const [dataSharing, setDataSharing] = useState(false);
  const [researchParticipation, setResearchParticipation] = useState(true);
  const [locationTracking, setLocationTracking] = useState(false);

  const handleBack = () => {
    navigation.goBack();
  }

  const confirmAccountDeletion = () => {
    Alert.alert(
      "Delete Account",
      "Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently removed.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", onPress: () => deleteAccount(), style: "destructive" }
      ]
    );
  };

  const deleteAccount = () => {
    // Implementation for account deletion
    Alert.alert("Account Deletion", "Your account deletion request has been processed.");
  };

  const exportData = () => {
    // Implementation for data export
    Alert.alert("Data Export", "Your data export has been initiated. You will receive an email when it's ready.");
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={handleBack} style={styles.backButton}>
          <Image 
            source={require('./assets/icon_back.png')} 
            style={styles.backIcon} 
          />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Privacy & Security</Text>
        <View style={styles.headerRightPlaceholder} />
      </View>

      <ScrollView style={styles.content}>
        {/* Security Settings Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Security</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Two-Factor Authentication</Text>
              <Text style={styles.settingDescription}>Add an extra layer of security to your account</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometricEnabled}
            />
          </View>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Biometric Login</Text>
              <Text style={styles.settingDescription}>Use fingerprint or face recognition to log in</Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={setBiometricEnabled}
            />
          </View>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Change Password</Text>
              <Text style={styles.settingDescription}>Update your account password</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
          
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Active Sessions</Text>
              <Text style={styles.settingDescription}>View and manage your logged-in devices</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Privacy Settings Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Privacy</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Data Sharing for Research</Text>
              <Text style={styles.settingDescription}>Allow anonymized data to be used for medical research</Text>
            </View>
            <Switch
              value={researchParticipation}
              onValueChange={setResearchParticipation}
            />
          </View>
          
          {/* <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Location Tracking</Text>
              <Text style={styles.settingDescription}>Allow us to collect location data for better care</Text>
            </View>
            <Switch
              value={locationTracking}
              onValueChange={setLocationTracking}
            />
          </View> */}
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Personalized Advertising</Text>
              <Text style={styles.settingDescription}>Allow personalized ads based on your health interests</Text>
            </View>
            <Switch
              value={dataSharing}
              onValueChange={setDataSharing}
            />
          </View>
        </View>

        {/* Data Management Card */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          
          <TouchableOpacity style={styles.settingItem} onPress={exportData}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Export My Data</Text>
              <Text style={styles.settingDescription}>Download a copy of your health information</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
{/*           
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingName}>Data Retention Settings</Text>
              <Text style={styles.settingDescription}>Manage how long we keep your information</Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity> */}
          
          <TouchableOpacity 
            style={[styles.settingItem, styles.destructiveSetting]} 
            onPress={confirmAccountDeletion}
          >
            <View style={styles.settingInfo}>
              <Text style={[styles.settingName, styles.destructiveText]}>Delete Account</Text>
              <Text style={styles.settingDescription}>Permanently remove your account and all data</Text>
            </View>
            <Text style={[styles.chevron, styles.destructiveText]}>›</Text>
          </TouchableOpacity>
        </View>

        {/* Legal Card */}
<View style={styles.card}>
  <Text style={styles.sectionTitle}>Legal</Text>
  
  <TouchableOpacity 
    style={styles.settingItem}
    onPress={() => Linking.openURL('https://api.twentytwohealth.com/privacy')}
  >
    <View style={styles.settingInfo}>
      <Text style={styles.settingName}>Privacy Policy</Text>
      <Text style={styles.settingDescription}>How we collect, use, and protect your data</Text>
    </View>
    <Text style={styles.chevron}>›</Text>
  </TouchableOpacity>
  
  <TouchableOpacity 
    style={styles.settingItem}
    onPress={() => Linking.openURL('https://api.twentytwohealth.com/privacy')}
  >
    <View style={styles.settingInfo}>
      <Text style={styles.settingName}>Terms of Service</Text>
      <Text style={styles.settingDescription}>Rules and guidelines for using our service</Text>
    </View>
    <Text style={styles.chevron}>›</Text>
  </TouchableOpacity>
  
  <TouchableOpacity 
    style={styles.settingItem}
    onPress={() => Linking.openURL('https://api.twentytwohealth.com/privacy')}
  >
    <View style={styles.settingInfo}>
      <Text style={styles.settingName}>HIPAA Compliance</Text>
      <Text style={styles.settingDescription}>How we protect your health information</Text>
    </View>
    <Text style={styles.chevron}>›</Text>
  </TouchableOpacity>
  
  <TouchableOpacity 
    style={styles.settingItem}
    onPress={() => Linking.openURL('https://api.twentytwohealth.com/privacy')}
  >
    <View style={styles.settingInfo}>
      <Text style={styles.settingName}>Data Processing Agreement</Text>
      <Text style={styles.settingDescription}>How we handle and process your data</Text>
    </View>
    <Text style={styles.chevron}>›</Text>
  </TouchableOpacity>
</View>

        {/* Compliance Badge */}
        <View style={styles.complianceCard}>
          <Text style={styles.complianceTitle}>Compliance & Certifications</Text>
          <View style={styles.badgeContainer}>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>HIPAA</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>GDPR</Text>
            </View>
            <View style={styles.badge}>
              <Text style={styles.badgeText}>HITRUST</Text>
            </View>
          </View>
          <Text style={styles.complianceDescription}>
            Our platform meets rigorous security standards to protect your health information.
          </Text>
        </View>
      </ScrollView>
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
    paddingHorizontal: 15,
    paddingTop: 10,
  },
  backButton: {
    padding: 8
  },
  backIcon: {
    width: width * 0.06,
    height: width * 0.06,
    tintColor: '#fff'
  },
  headerTitle: {
    color: '#fff',
    fontSize: width * 0.05,
    fontWeight: 'bold'
  },
  headerRightPlaceholder: {
    width: width * 0.06
  },
  content: {
    flex: 1,
    padding: 16,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#014e6b',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  settingInfo: {
    flex: 1,
    paddingRight: 16,
  },
  settingName: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
  },
  chevron: {
    fontSize: 24,
    color: '#ccc',
  },
  destructiveSetting: {
    borderBottomWidth: 0,
    marginTop: 8,
  },
  destructiveText: {
    color: '#e74c3c',
  },
  complianceCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  complianceTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#014e6b',
  },
  badgeContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  badge: {
    backgroundColor: '#e1f5fe',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    margin: 4,
  },
  badgeText: {
    color: '#01579b',
    fontWeight: 'bold',
    fontSize: 12,
  },
  complianceDescription: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});