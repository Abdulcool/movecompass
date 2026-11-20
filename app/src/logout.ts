import AsyncStorage from '@react-native-async-storage/async-storage';
import { api,ApiError } from './api';
import { unregisterNotifications } from './notifications';
import {pushStateKeys} from './push-subscription';

export async function clearSession(base:string,token:string) {
  try {await unregisterNotifications(base);await api(base,'/api/auth/logout',token,{});}
  catch(error){if(!(error instanceof ApiError)||![401,403].includes(error.status))throw error;}
  await AsyncStorage.multiRemove(['mc-token','mc-user',...pushStateKeys]);
}
