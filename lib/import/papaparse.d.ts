declare module 'papaparse' {
  type ParseError = {
    message: string;
  };

  type ParseResult<T> = {
    data: T[];
    errors: ParseError[];
  };

  type ParseConfig = {
    skipEmptyLines?: boolean | 'greedy';
  };

  const Papa: {
    parse<T>(input: string, config?: ParseConfig): ParseResult<T>;
  };

  export default Papa;
}
