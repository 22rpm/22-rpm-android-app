import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Dimensions } from 'react-native';
import globalStyles from './globalStyles';
import BottomBar from './BottomBar';
const cells = [
  { id: 1, heading: 'Weight', unit: 'kg' },
  { id: 2, heading: 'Weight', unit: 'pounds' }
];

const { height } = Dimensions.get('window'); // Get the device's screen height

export default function Home({ navigation }) {
    const handleBack = () => {
        navigation.navigate('Home');
    };
  
    const handleButtonPress = (buttonId) => {
    console.log(`Button ${buttonId} pressed`);
    if (buttonId === 'A') {
      navigation.navigate('Profile');
    } else if (buttonId === 'B') {
      navigation.navigate('Home');
    } else if (buttonId === 'C') {
      navigation.navigate('Connection');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.rectangle}>
        <TouchableOpacity style={styles.image} onPress={handleBack}>
        <Image style={styles.image} source={require("./assets/icon_back.png")}  />
        </TouchableOpacity>
        <Text style={styles.rectangleText}>Weight</Text>
     </View>
      <View style={styles.grid}>
        {cells.map((cell) => {
            // Function to get the dynamic value by ID
            const getValueById = (id) => {
            switch (id) {
                case 1:
                return 80.5; // Value for ID 1
                case 2:
                return 177.5;  // Value for ID 2
                default:
                return 0; // Default value
            }
            };

            return (
            <TouchableOpacity
                key={cell.id}
                style={styles.cell}
            >
                <Text style={styles.cellText}>{cell.heading}</Text>
                <Text style={styles.cellValue}>{getValueById(cell.id)}</Text>
                <Text style={styles.cellUnit}>{cell.unit}</Text>
            </TouchableOpacity>
            );
        })}
        </View>

      {/* Sticky Bottom Bar */}
      <BottomBar onButtonPress={handleButtonPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ebf2f9',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
  },

  grid: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    gap:20
  },
  cell: {
    width: '90%',
    height: 180,
    backgroundColor: '#ffffff',
    padding: 10,
    alignItems: 'center',
    borderRadius: 25,
    borderWidth: 1,
    borderColor: '#eee',
    flexDirection: 'column',
  },
  image: {
    width: 50,
    height: 50,
    resizeMode: 'contain',
    backgroundColor: globalStyles.header.color,
    marginBottom: 15
  },
  cellText: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginHorizontal: 10,
  },
  cellValue: {
    fontSize: 50,
    fontWeight: '700',
    textAlign: 'center',
    marginHorizontal: 10,
    color: "#50b48d"
    },
  cellUnit: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '400',
    textAlign: 'center',
    marginHorizontal: 10,
    color: "#000"
    },
  rectangle: {
    width: '100%',
    height: 200,
    backgroundColor: globalStyles.header.color,
    padding: 20,
    justifyContent: 'space-between',
    marginBottom: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
  },
  rectangleText: {
    color: 'white',
    fontSize: 40,
    fontWeight: 'bold',
    textAlign: 'left',
  },

  // Sticky Bottom Bar Styles
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
    backgroundColor: '#ebf2f9',
    paddingVertical: 10,
    paddingHorizontal: 25,
    borderRadius: 50,
  },
  buttonText: {
    color: 'black',
    fontSize: 18,
    fontWeight: 'bold',
  },
});
