import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  ImageBackground,
  Animated,
} from 'react-native';
import globalStyles from './globalStyles';
import CookieManager from '@react-native-cookies/cookies';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ReactNativeBiometrics from 'react-native-biometrics';

const { width, height } = Dimensions.get('window');

export default function Login({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isBiometricSupported, setIsBiometricSupported] = useState(false);
  const [biometricType, setBiometricType] = useState(null);
  const [hasBiometricCredentials, setHasBiometricCredentials] = useState(false);
  const [autoBiometricAttempts, setAutoBiometricAttempts] = useState(0);
  const [showManualLogin, setShowManualLogin] = useState(false);
  const [isAutoAuthenticating, setIsAutoAuthenticating] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;

  // Initialize app
  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Check biometric availability
        const rnBiometrics = new ReactNativeBiometrics();
        const { available, biometryType } =
          await rnBiometrics.isSensorAvailable();

        if (
          available &&
          (biometryType === 'FaceID' ||
            biometryType === 'TouchID' ||
            biometryType === 'Biometrics')
        ) {
          setIsBiometricSupported(true);
          setBiometricType(biometryType);
          console.log(`Biometric type: ${biometryType}`);
        }

        // Check for stored credentials
        const storedEmail = await AsyncStorage.getItem('biometric_email');
        const storedPassword = await AsyncStorage.getItem('biometric_password');

        if (storedEmail && storedPassword) {
          setHasBiometricCredentials(true);
          setEmail(storedEmail);

          // Auto trigger biometric after a short delay
          setTimeout(() => {
            triggerAutoBiometric();
          }, 1500);
        } else {
          // No stored credentials, show manual login immediately
          setShowManualLogin(true);
          animateFormIn();
        }
      } catch (error) {
        console.error('Initialization error:', error);
        // On error, show manual login
        setShowManualLogin(true);
        animateFormIn();
      } finally {
        setIsInitialized(true);
      }
    };

    initializeApp();
  }, []);

  const animateFormIn = () => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 500,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const getBiometricPromptMessage = () => {
    switch (biometricType) {
      case 'FaceID':
        return 'Face ID for ' + (email || 'your account');
      case 'TouchID':
        return 'Fingerprint for ' + (email || 'your account');
      default:
        return 'Biometric authentication for ' + (email || 'your account');
    }
  };

  const getBiometricButtonText = () => {
    switch (biometricType) {
      case 'FaceID':
        return 'Login with Face ID';
      case 'TouchID':
        return 'Login with Fingerprint';
      default:
        return 'Login with Biometrics';
    }
  };

  const getAutoBiometricText = () => {
    switch (biometricType) {
      case 'FaceID':
        return 'Looking for Face ID...';
      case 'TouchID':
        return 'Looking for Fingerprint...';
      default:
        return 'Looking for Biometrics...';
    }
  };

  const triggerAutoBiometric = async () => {
    if (isAutoAuthenticating || showManualLogin) return;

    setIsAutoAuthenticating(true);
    console.log(`Auto ${biometricType} attempt ${autoBiometricAttempts + 1}`);

    try {
      const rnBiometrics = new ReactNativeBiometrics();

      const storedEmail = await AsyncStorage.getItem('biometric_email');
      const promptMessage = getBiometricPromptMessage();

      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: promptMessage,
        cancelButtonText: 'Use Password',
      });

      if (success) {
        // Biometric authentication successful
        await performAutoLogin();
      } else {
        // User cancelled or failed
        handleBiometricFailure();
      }
    } catch (error) {
      console.error(`Auto ${biometricType} error:`, error);
      handleBiometricFailure();
    } finally {
      setIsAutoAuthenticating(false);
    }
  };

  const handleBiometricFailure = () => {
    const newAttempts = autoBiometricAttempts + 1;
    setAutoBiometricAttempts(newAttempts);

    if (newAttempts >= 2) {
      // After 2 failed attempts, show manual login
      setShowManualLogin(true);
      animateFormIn();
    } else {
      // Retry after 1.5 second
      setTimeout(() => {
        if (!showManualLogin) {
          triggerAutoBiometric();
        }
      }, 1500);
    }
  };

  const performAutoLogin = async () => {
    try {
      const storedEmail = await AsyncStorage.getItem('biometric_email');
      const storedPassword = await AsyncStorage.getItem('biometric_password');

      if (storedEmail && storedPassword) {
        setIsLoading(true);

        // Determine login method based on stored identifier
        const method = storedEmail.includes('@') ? 'email' : 'username'; // Added this line

        const response = await fetch(
          'https://api.twentytwohealth.com/rpm-be/api/auth/login',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              identifier: storedEmail,
              password: storedPassword,
              method: method,
              login_method: 'biometric',
            }),
          },
        );

        const text = await response.text();
        console.log('Auto login response:', text);

        let data;
        try {
          data = JSON.parse(text);
        } catch (e) {
          console.error('Failed to parse JSON:', e);
          setShowManualLogin(true);
          animateFormIn();
          return;
        }

        if (response.ok && data.requiresOtp) {
          setShowOtpModal(true);
        } else if (response.ok && data.token) {
          const cookies = await CookieManager.get(
            'https://api.twentytwohealth.com/rpm-be',
          );
          const accessToken = cookies?.token?.value;
          const refreshToken = cookies?.refresh_token?.value;

          if (accessToken && refreshToken) {
            await AsyncStorage.setItem('token', accessToken);
            await AsyncStorage.setItem('refreshToken', refreshToken);
          }

          navigation.replace('Home');
        } else {
          // Login failed, show manual form
          setShowManualLogin(true);
          animateFormIn();
        }
      } else {
        // No stored credentials, show manual form
        setShowManualLogin(true);
        animateFormIn();
      }
    } catch (error) {
      console.error('Auto login error:', error);
      setShowManualLogin(true);
      animateFormIn();
    } finally {
      setIsLoading(false);
    }
  };

  const storeCredentialsForBiometric = async (userEmail, userPassword) => {
    try {
      await AsyncStorage.setItem('biometric_email', userEmail);
      await AsyncStorage.setItem('biometric_password', userPassword);
      setHasBiometricCredentials(true);
    } catch (error) {
      console.error('Error storing credentials:', error);
    }
  };

  const removeStoredCredentials = async () => {
    try {
      await AsyncStorage.removeItem('biometric_email');
      await AsyncStorage.removeItem('biometric_password');
      setHasBiometricCredentials(false);
      Alert.alert('Success', `${biometricType} login has been removed.`);
    } catch (error) {
      console.error('Error removing credentials:', error);
    }
  };

  const handleManualBiometric = async () => {
    try {
      setIsLoading(true);
      const rnBiometrics = new ReactNativeBiometrics();
      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: getBiometricPromptMessage(),
        cancelButtonText: 'Cancel',
      });

      if (success) {
        await performAutoLogin();
      }
    } catch (error) {
      console.error('Manual biometric error:', error);
      Alert.alert(
        'Error',
        `${biometricType} authentication failed. Please try again.`,
      );
    } finally {
      setIsLoading(false);
    }
  };

  const performLogin = async (userIdentifier, userPassword) => {
    setIsLoading(true);
    setError('');

    try {
      // Determine if identifier is email or username
      const method = userIdentifier.includes('@') ? 'email' : 'username'; // Added this line

      const response = await fetch(
        'https://api.twentytwohealth.com/rpm-be/api/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            identifier: userIdentifier,
            password: userPassword,
            method: method, // Use the determined method
          }),
        },
      );

      const text = await response.text();
      console.log('Raw login response:', text);

      let data;
      try {
        data = JSON.parse(text);
      } catch (e) {
        console.error('Failed to parse JSON:', e);
        setError(`Server returned invalid response: ${e} & ${text}`);
        return;
      }

      if (response.ok && data.requiresOtp) {
        console.log('OTP flow started');
        setShowOtpModal(true);
      } else if (response.ok && data.token) {
        console.log('Login successful, saving tokens');
        const cookies = await CookieManager.get(
          'https://api.twentytwohealth.com/rpm-be',
        );
        const accessToken = cookies?.token?.value;
        const refreshToken = cookies?.refresh_token?.value;

        if (accessToken && refreshToken) {
          await AsyncStorage.setItem('token', accessToken);
          await AsyncStorage.setItem('refreshToken', refreshToken);
        }

        // Ask user if they want to enable biometric for future logins
        if (isBiometricSupported && !hasBiometricCredentials) {
          Alert.alert(
            `Enable ${biometricType}?`,
            `Do you want to enable ${biometricType} for faster login in the future?`,
            [
              {
                text: 'Not Now',
                style: 'cancel',
                onPress: () => navigation.replace('Home'),
              },
              {
                text: 'Enable',
                onPress: async () => {
                  await storeCredentialsForBiometric(userIdentifier, userPassword);
                  navigation.replace('Home');
                },
              },
            ],
          );
        } else {
          navigation.replace('Home');
        }
      } else {
        setError(data.message || 'Login failed. Please try again.');
      }
    } catch (error) {
      console.error('Login error:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError('Please fill all fields');
      return;
    }

    // const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    // if (!emailRegex.test(email)) {
    //   setError('Please enter a valid email address');
    //   return;
    // }
    // Only validate email format if identifier contains '@'
    if (email.includes('@')) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setError('Please enter a valid email address');
        return;
      }
    }
    +(await performLogin(email, password));
  };

  const handleOtpVerification = async () => {
    if (!otp || otp.length !== 6) {
      setError('Please enter a valid 6-digit OTP');
      return;
    }

    setIsVerifyingOtp(true);
    setError('');

    try {
      const response = await fetch(
        'https://api.twentytwohealth.com/rpm-be/api/auth/verify-otp',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            identifier: email,  // Use the identifier (could be email or username)
            otp,
            device_fingerprint: 'unique-browser-hash',
          }),
        },
      );

      const data = await response.json();

      if (response.ok) {
        const cookies = await CookieManager.get(
          'https://api.twentytwohealth.com/rpm-be',
        );
        const accessToken = cookies?.token?.value;
        const refreshToken = cookies?.refresh_token?.value;

        if (accessToken && refreshToken) {
          await AsyncStorage.setItem('token', accessToken);
          await AsyncStorage.setItem('refreshToken', refreshToken);
        }

        // Ask user if they want to enable biometric for future logins
        if (isBiometricSupported && !hasBiometricCredentials) {
          Alert.alert(
            `Enable ${biometricType}?`,
            `Do you want to enable ${biometricType} for faster login in the future?`,
            [
              {
                text: 'Not Now',
                style: 'cancel',
                onPress: () => navigation.replace('Home'),
              },
              {
                text: 'Enable',
                onPress: async () => {
                  await storeCredentialsForBiometric(email, password);
                  navigation.replace('Home');
                },
              },
            ],
          );
        } else {
          navigation.replace('Home');
        }
      } else {
        setError(data.message || 'Invalid OTP. Please try again.');
      }
    } catch (error) {
      console.error('OTP verification error:', error);
      setError('Network error. Please check your connection and try again.');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  // Refresh auth token function
  const refreshAuthToken = async () => {
    try {
      const response = await fetch(
        'https://api.twentytwohealth.com/rpm-be/api/auth/refresh-token',
        {
          method: 'POST',
          credentials: 'include',
        },
      );

      if (!response.ok) {
        console.log('Refresh failed, logging out');
        navigation.replace('Login');
        return;
      }

      console.log('Auth token refreshed successfully');
    } catch (error) {
      console.error('Token refresh error:', error);
      navigation.replace('Login');
    }
  };

  useEffect(() => {
    const interval = setInterval(() => {
      refreshAuthToken();
    }, 14 * 60 * 1000);

    return () => clearInterval(interval);
  }, []);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Background Image */}
        <View style={styles.backgroundWrapper}>
          <ImageBackground
            source={require('./assets/loginbk.png')}
            style={styles.backgroundImage}
            resizeMode="cover"
          >
            <View style={styles.backgroundOverlay} />
            <Image
              source={require('./assets/infuzamed_logo.png')}
              style={styles.logo}
              resizeMode="contain"
            />
          </ImageBackground>
        </View>

        {/* Show loading only when auto biometric is in progress */}
        {!showManualLogin &&
          hasBiometricCredentials &&
          isBiometricSupported && (
            <View style={styles.autoFaceIdContainer}>
              <ActivityIndicator
                size="large"
                color={globalStyles.primaryColor.color}
              />
              <Text style={styles.autoFaceIdText}>
                {getAutoBiometricText()}
              </Text>
              <Text style={styles.autoFaceIdSubText}>
                Attempt {Math.min(autoBiometricAttempts + 1, 2)} of 2
              </Text>

              <TouchableOpacity
                style={styles.usePasswordButton}
                onPress={() => {
                  setShowManualLogin(true);
                  animateFormIn();
                }}
              >
                <Text style={styles.usePasswordText}>Use Password Instead</Text>
              </TouchableOpacity>
            </View>
          )}

        {/* Show manual login form when:
            - No biometric credentials stored
            - Biometric failed twice  
            - User tapped "Use Password Instead"
        */}
        {(showManualLogin ||
          !hasBiometricCredentials ||
          !isBiometricSupported) && (
          <Animated.View
            style={[
              styles.formContainer,
              {
                opacity: fadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            {/* Email Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email or Username</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={text => {
                  setEmail(text);
                  setError('');
                }}
                placeholder="Enter your email or username"
                placeholderTextColor="#999"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Password Field */}
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <TextInput
                style={styles.input}
                value={password}
                onChangeText={text => {
                  setPassword(text);
                  setError('');
                }}
                placeholder="Enter your password"
                placeholderTextColor="#999"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {/* Error Message */}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            {/* Login Button */}
            <TouchableOpacity
              style={[styles.button, isLoading && styles.buttonDisabled]}
              onPress={handleLogin}
              activeOpacity={0.8}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Login</Text>
              )}
            </TouchableOpacity>

            {/* Biometric Button (Manual Trigger) - Only show if we have stored credentials */}
            {isBiometricSupported && hasBiometricCredentials && (
              <TouchableOpacity
                style={styles.biometricButton}
                onPress={handleManualBiometric}
                activeOpacity={0.8}
                disabled={isLoading}
              >
                <Text style={styles.biometricButtonText}>
                  {getBiometricButtonText()}
                </Text>
              </TouchableOpacity>
            )}

            {/* Remove Biometric Data Option */}
            {hasBiometricCredentials && (
              <TouchableOpacity
                style={styles.removeBiometricButton}
                onPress={removeStoredCredentials}
              >
                <Text style={styles.removeBiometricText}>
                  Remove Saved {biometricType}
                </Text>
              </TouchableOpacity>
            )}
          </Animated.View>
        )}

        {/* Footer - Always show at bottom */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>Developed By</Text>
          <Text style={[styles.footerText, styles.footerCompany]}>
            Revive Medical Technologies Inc.
          </Text>
        </View>
      </ScrollView>

      {/* OTP Verification Modal */}
      <Modal
        visible={showOtpModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowOtpModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>OTP Verification</Text>
            <Text style={styles.modalSubtitle}>
              Please enter the 6-digit OTP sent to your email
            </Text>

            <TextInput
              style={styles.otpInput}
              value={otp}
              onChangeText={text => {
                setOtp(text);
                setError('');
              }}
              placeholder="Enter OTP"
              placeholderTextColor="#999"
              keyboardType="numeric"
              maxLength={6}
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.cancelButton]}
                onPress={() => {
                  setShowOtpModal(false);
                  setOtp('');
                  setError('');
                }}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[
                  styles.modalButton,
                  styles.verifyButton,
                  isVerifyingOtp && styles.buttonDisabled,
                ]}
                onPress={handleOtpVerification}
                disabled={isVerifyingOtp}
              >
                {isVerifyingOtp ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.verifyButtonText}>Verify</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

// Styles remain the same as in your original code
const styles = StyleSheet.create({
  // ... (keep all your existing styles exactly as they are)
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'space-between',
  },
  backgroundWrapper: {
    width: '100%',
    height: '40%',
    borderBottomLeftRadius: '10%',
    borderBottomRightRadius: '10%',
    overflow: 'hidden',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  backgroundImage: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backgroundOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderBottomLeftRadius: '10%',
    borderBottomRightRadius: '10%',
  },
  logo: {
    width: 350,
    height: 300,
    zIndex: 1,
  },
  autoFaceIdContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: width * 0.1,
    minHeight: height * 0.3,
  },
  autoFaceIdText: {
    fontSize: width * 0.045,
    fontWeight: 'bold',
    color: '#2f2f2f',
    marginTop: height * 0.03,
    textAlign: 'center',
  },
  autoFaceIdSubText: {
    fontSize: width * 0.035,
    color: '#666',
    marginTop: height * 0.01,
    textAlign: 'center',
  },
  usePasswordButton: {
    marginTop: height * 0.04,
    padding: 15,
  },
  usePasswordText: {
    color: globalStyles.primaryColor.color,
    fontSize: width * 0.04,
    fontWeight: '500',
  },
  formContainer: {
    paddingHorizontal: width * 0.1,
    marginTop: height * 0.03,
    flex: 1,
  },
  inputGroup: {
    marginBottom: height * 0.02,
  },
  label: {
    fontSize: width * 0.045,
    fontWeight: 'bold',
    color: '#2f2f2f',
    marginBottom: height * 0.01,
  },
  input: {
    width: '100%',
    fontSize: width * 0.04,
    padding: width * 0.04,
    borderRadius: 12,
    backgroundColor: '#ebf2f9',
    color: '#333',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  errorText: {
    color: '#e74c3c',
    fontSize: width * 0.035,
    marginTop: height * 0.01,
    textAlign: 'center',
    fontWeight: '500',
  },
  button: {
    backgroundColor: globalStyles.primaryColor.color,
    paddingVertical: height * 0.02,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.04,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  biometricButton: {
    backgroundColor: '#007AFF',
    paddingVertical: height * 0.02,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.02,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  removeBiometricButton: {
    paddingVertical: height * 0.015,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: height * 0.01,
  },
  removeBiometricText: {
    color: '#666',
    fontSize: width * 0.035,
    textDecorationLine: 'underline',
  },
  buttonDisabled: {
    backgroundColor: '#a0a0a0',
    opacity: 0.7,
  },
  buttonText: {
    color: 'white',
    fontSize: width * 0.045,
    fontWeight: 'bold',
  },
  biometricButtonText: {
    color: 'white',
    fontSize: width * 0.04,
    fontWeight: 'bold',
  },
  footer: {
    paddingBottom: height * 0.03,
    alignItems: 'center',
    width: '100%',
    marginTop: height * 0.05,
  },
  footerText: {
    fontSize: width * 0.035,
    color: '#a1a1a1',
  },
  footerCompany: {
    fontWeight: '600',
    fontSize: width * 0.04,
    marginTop: height * 0.005,
  },
  // Modal styles
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 20,
  },
  modalContent: {
    width: '90%',
    backgroundColor: 'white',
    borderRadius: 15,
    padding: 20,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: width * 0.05,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#2f2f2f',
  },
  modalSubtitle: {
    fontSize: width * 0.035,
    textAlign: 'center',
    marginBottom: 20,
    color: '#666',
  },
  otpInput: {
    width: '80%',
    fontSize: width * 0.05,
    padding: 15,
    borderRadius: 10,
    backgroundColor: '#f5f5f5',
    textAlign: 'center',
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    flex: 1,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#f1f1f1',
  },
  verifyButton: {
    backgroundColor: globalStyles.primaryColor.color,
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: 'bold',
  },
  verifyButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
