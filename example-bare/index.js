import { AppRegistry } from 'react-native';
import RootNavigator from './src/RootNavigator';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => RootNavigator);
