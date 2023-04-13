// Importing required libraries
#include <algorithm> // for sorting strings
#include <fstream> // for file input/output operations
#include <functional> // for std::plus and std::equal_to
#include <iostream> // for standard input/output
#include <map> // for associative container map
#include <numeric> // for inner_product
#include <set> // for sorted container set
#include <string> // for string operations

// Check if two given strings are deranged or not
bool is_deranged(const std::string& left, const std::string& right);

// Main function of the program
int main();

// Types declarations

// A set containing string words
typedef std::setstd::string WordList;

// A map of strings with corresponding set of strings
typedef std::map<std::string, WordList> AnagraMap;

// A pair of strings containing two strings from input file
typedef std::pair<std::string, std::string> ResultPair;

// A struct containing the longest pair of deranged words and their length
struct LongestPair {
    ResultPair pair;
    size_t length;
};