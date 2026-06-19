import morgan from 'morgan';

const stream = {
  write: (message) => {
    console.log(message.trim());
  }
};

const skip = () => {
  return process.env.NODE_ENV === 'test';
};

export const logger = morgan('combined', { stream, skip });