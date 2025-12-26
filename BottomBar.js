import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import globalStyles from './globalStyles'; // Adjust the import path if needed

const BottomBar = ({ onButtonPress }) => {
    const [selectedTab, setSelectedTab] = useState('B'); // Default selected tab

    const handlePress = (tab) => {
        setSelectedTab(tab); // Update the selected tab
        onButtonPress(tab); // Trigger parent callback
    };

    return (
        <View style={styles.bottomBar}>
            <TouchableOpacity
                style={styles.button}
                onPress={() => handlePress('A')}
            >
                <Image
                    source={selectedTab === 'A' ? require('./assets/user.png') : require('./assets/user.png')}
                    style={styles.icon}
                />
                <Text
                    style={[styles.buttonText, selectedTab === 'A' && { color: globalStyles.primaryColor.color }]}
                >
                    Profile
                </Text>
                {selectedTab === 'A' && <View style={styles.highlightBar} />}
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.button}
                onPress={() => handlePress('B')}
            >
                <Image
                    source={selectedTab === 'B' ? require('./assets/home.png') : require('./assets/home.png')}
                    style={styles.icon}
                />
                <Text
                    style={[styles.buttonText, selectedTab === 'B' && { color: globalStyles.primaryColor.color }]}
                >
                    Home
                </Text>
                {selectedTab === 'B' && <View style={styles.highlightBar} />}
            </TouchableOpacity>
            <TouchableOpacity
                style={styles.button}
                onPress={() => handlePress('C')}
            >
                <Image
                    source={selectedTab === 'C' ? require('./assets/settings.png') : require('./assets/settings.png')}
                    style={styles.icon}
                />
                <Text
                    style={[styles.buttonText, selectedTab === 'C' && { color: globalStyles.primaryColor.color }]}
                >
                    Settings
                </Text>
                {selectedTab === 'C' && <View style={styles.highlightBar} />}
            </TouchableOpacity>
        </View>
    );
};

const styles = StyleSheet.create({
    bottomBar: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 100,
        backgroundColor: '#ffffff',
        flexDirection: 'row',
        justifyContent: 'space-around',
        alignItems: 'center',
        paddingHorizontal: 10,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -10 },
        shadowOpacity: 0.95,
        shadowRadius: 20,
        elevation: 20,
    },
    button: {
        justifyContent: 'center',
        alignItems: 'center',
        flex: 1, // Optional: To make buttons equally distributed in width
        position: 'relative', // Ensure highlight bar positions correctly
    },
    icon: {
        width: 30,
        height: 30,
        resizeMode: 'contain',
    },
    buttonText: {
        marginTop: 5, // Adds space between icon and text
        textAlign: 'center',
        fontSize: 12,
        color: '#000000',
    },
    highlightBar: {
        position: 'absolute',
        bottom: -5, // Position the highlight bar just below the text
        width: '80%',
        height: 4,
        backgroundColor: globalStyles.primaryColor.color,
        borderRadius: 2,
    },
});

export default BottomBar;
